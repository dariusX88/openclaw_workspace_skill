import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Simple cookie parser (no dependency needed) ────────────────────────────
function parseCookies(header: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!header) return cookies;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k) cookies[k] = v.join("=");
  }
  return cookies;
}

// ── Login page HTML (inline, no external file) ─────────────────────────────
const LOGIN_HTML = `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Login — Workspace Files</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:system-ui,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;background:#f8f9fb}
  .card{background:#fff;padding:2.5rem;border-radius:12px;box-shadow:0 2px 12px rgba(0,0,0,0.08);width:100%;max-width:380px}
  h2{font-size:1.25rem;margin-bottom:0.25rem}
  p{font-size:0.85rem;color:#6b7280;margin-bottom:1.5rem}
  label{font-size:0.8rem;font-weight:600;color:#374151;display:block;margin-bottom:0.3rem}
  input{width:100%;padding:0.6rem 0.75rem;border:1px solid #d1d5db;border-radius:6px;font-size:0.9rem;font-family:inherit}
  input:focus{outline:none;border-color:#2563eb;box-shadow:0 0 0 2px rgba(37,99,235,0.15)}
  button{width:100%;margin-top:1.25rem;padding:0.65rem;background:#2563eb;color:#fff;border:none;border-radius:6px;font-size:0.9rem;font-weight:500;cursor:pointer;font-family:inherit}
  button:hover{background:#1d4ed8}
  .icon{font-size:2rem;margin-bottom:0.75rem}
</style>
</head><body>
<div class="card">
  <div class="icon">&#128193;</div>
  <h2>Workspace Files</h2>
  <p>Enter your service token to access the file browser.</p>
  <form method="get" action="/browser">
    <label for="token">Service Token</label>
    <input name="token" id="token" type="password" placeholder="wsk_..." required autocomplete="off">
    <button type="submit">Sign In</button>
  </form>
</div>
</body></html>`;

// ── Browser route plugin ───────────────────────────────────────────────────
export async function browserRoutes(app: FastifyInstance) {
  const { db, serviceToken } = app as any;
  const filesDir = (app as any).config.FILES_DIR as string;

  // Load HTML at startup (cached in memory)
  const htmlPath = path.join(__dirname, "..", "public", "browser.html");
  let browserHtml = "";
  try {
    browserHtml = await fs.promises.readFile(htmlPath, "utf-8");
  } catch {
    browserHtml = "<h1>browser.html not found</h1><p>Expected at: " + htmlPath + "</p>";
  }

  // ── Auth helper (cookie-based) ──────────────────
  function assertBrowserAuth(req: FastifyRequest) {
    const cookies = parseCookies(req.headers.cookie || "");
    if (!cookies.ws_session || cookies.ws_session !== serviceToken) {
      const err: any = new Error("Unauthorized");
      err.statusCode = 401;
      throw err;
    }
  }

  // ── GET /browser ── Serve HTML or handle login ──
  app.get("/browser", async (req: FastifyRequest, reply: FastifyReply) => {
    const token = (req.query as any)?.token;

    // Token in query → validate, set cookie, redirect
    if (token) {
      if (token !== serviceToken) {
        reply.code(401).type("text/html").send(
          LOGIN_HTML.replace("</form>", '<p style="color:#dc2626;margin-top:0.75rem;font-size:0.85rem">Invalid token. Try again.</p></form>')
        );
        return;
      }
      reply
        .header(
          "Set-Cookie",
          `ws_session=${token}; HttpOnly; Path=/browser; SameSite=Strict; Max-Age=86400`
        )
        .redirect("/browser");
      return;
    }

    // Check cookie
    const cookies = parseCookies(req.headers.cookie || "");
    if (!cookies.ws_session || cookies.ws_session !== serviceToken) {
      reply.type("text/html").send(LOGIN_HTML);
      return;
    }

    // Authenticated → serve the file browser
    reply.type("text/html").send(browserHtml);
  });

  // ── GET /browser/api/workspaces ─────────────────
  app.get("/browser/api/workspaces", async (req) => {
    assertBrowserAuth(req);
    const rows = await db.q(
      "select id, name, created_at from workspaces order by name asc"
    );
    return { workspaces: rows };
  });

  // ── GET /browser/api/files ──────────────────────
  app.get("/browser/api/files", async (req) => {
    assertBrowserAuth(req);
    const workspaceId = (req.query as any)?.workspaceId;

    if (workspaceId) {
      const rows = await db.q(
        `select f.id, f.workspace_id, f.filename, f.content_type,
                f.size_bytes, f.created_at, w.name as workspace_name
         from files f
         left join workspaces w on w.id = f.workspace_id
         where f.workspace_id = $1
         order by f.created_at desc`,
        [workspaceId]
      );
      return { files: rows };
    }

    const rows = await db.q(
      `select f.id, f.workspace_id, f.filename, f.content_type,
              f.size_bytes, f.created_at, w.name as workspace_name
       from files f
       left join workspaces w on w.id = f.workspace_id
       order by f.created_at desc
       limit 500`
    );
    return { files: rows };
  });

  // ── GET /browser/api/files/:id/download ─────────
  app.get("/browser/api/files/:id/download", async (req, reply) => {
    assertBrowserAuth(req);
    const id = (req.params as any).id;
    const rows = await db.q("select * from files where id=$1", [id]);
    if (!rows[0]) {
      reply.code(404);
      return { error: "not found" };
    }
    const f = rows[0];
    reply.header("Content-Type", f.content_type || "application/octet-stream");
    reply.header(
      "Content-Disposition",
      `attachment; filename="${f.filename}"`
    );
    return fs.createReadStream(f.storage_path);
  });

  // ── POST /browser/api/files ─────────────────────
  app.post("/browser/api/files", async (req, reply) => {
    assertBrowserAuth(req);
    const mp = await (req as any).file();
    const workspaceId =
      (req.query as any)?.workspaceId || mp?.fields?.workspaceId?.value;
    if (!workspaceId) {
      reply.code(400);
      return { error: "workspaceId required (query or form field)" };
    }
    const fileId = crypto.randomUUID();
    const safeName = (mp.filename || "file").replace(/[^\w.\-]+/g, "_");
    const storagePath = path.join(filesDir, `${fileId}__${safeName}`);
    await fs.promises.mkdir(filesDir, { recursive: true });
    await fs.promises.writeFile(storagePath, await mp.toBuffer());
    const stat = await fs.promises.stat(storagePath);
    const rows = await db.q(
      "insert into files (workspace_id, filename, content_type, size_bytes, storage_path) values ($1,$2,$3,$4,$5) returning id",
      [workspaceId, safeName, mp.mimetype ?? null, stat.size, storagePath]
    );
    return { id: rows[0].id, filename: safeName };
  });

  // ── DELETE /browser/api/files/:id ───────────────
  app.delete("/browser/api/files/:id", async (req, reply) => {
    assertBrowserAuth(req);
    const id = (req.params as any).id;
    const rows = await db.q("select * from files where id=$1", [id]);
    if (!rows[0]) {
      reply.code(404);
      return { error: "not found" };
    }
    // Delete from disk (ignore if already gone)
    try {
      await fs.promises.unlink(rows[0].storage_path);
    } catch {}
    // Delete from database
    await db.q("delete from files where id=$1", [id]);
    return { ok: true };
  });

  // ── POST /browser/api/workspaces ────────────────
  app.post("/browser/api/workspaces", async (req) => {
    assertBrowserAuth(req);
    const body = req.body as any;
    const rows = await db.q(
      "insert into workspaces (name) values ($1) returning id, name, created_at",
      [body.name]
    );
    return rows[0];
  });

  // ── PUT /browser/api/workspaces/:id ───────────
  app.put("/browser/api/workspaces/:id", async (req, reply) => {
    assertBrowserAuth(req);
    const id = (req.params as any).id;
    const body = req.body as any;
    const rows = await db.q(
      "update workspaces set name=$2 where id=$1 returning id, name",
      [id, body.name]
    );
    if (!rows[0]) { reply.code(404); return { error: "not found" }; }
    return rows[0];
  });

  // ═══════════════════════════════════════════════
  //  DOCS — list pages & get page with blocks
  // ═══════════════════════════════════════════════

  app.get("/browser/api/docs/pages", async (req) => {
    assertBrowserAuth(req);
    const workspaceId = (req.query as any)?.workspaceId;
    const where = workspaceId ? "where p.workspace_id = $1" : "";
    const params = workspaceId ? [workspaceId] : [];
    const rows = await db.q(
      `select p.id, p.title, p.workspace_id, p.created_at, p.updated_at,
              w.name as workspace_name
       from docs_pages p
       left join workspaces w on w.id = p.workspace_id
       ${where}
       order by p.updated_at desc nulls last, p.created_at desc`,
      params
    );
    return { pages: rows };
  });

  app.get("/browser/api/docs/pages/:id", async (req, reply) => {
    assertBrowserAuth(req);
    const id = (req.params as any).id;
    const pages = await db.q(
      `select p.*, w.name as workspace_name
       from docs_pages p
       left join workspaces w on w.id = p.workspace_id
       where p.id = $1`,
      [id]
    );
    if (!pages[0]) {
      reply.code(404);
      return { error: "not found" };
    }
    const blocks = await db.q(
      "select id, type, data, order_index from docs_blocks where page_id = $1 order by order_index asc",
      [id]
    );
    return { page: pages[0], blocks };
  });

  // ── POST /browser/api/docs/pages (create) ──────
  app.post("/browser/api/docs/pages", async (req) => {
    assertBrowserAuth(req);
    const body = req.body as any;
    const rows = await db.q(
      "insert into docs_pages (workspace_id, title) values ($1,$2) returning id",
      [body.workspaceId, body.title]
    );
    return { id: rows[0].id };
  });

  // ── POST /browser/api/docs/pages/:id/blocks ───
  app.post("/browser/api/docs/pages/:id/blocks", async (req) => {
    assertBrowserAuth(req);
    const pageId = (req.params as any).id;
    const body = req.body as any;
    const rows = await db.q(
      "insert into docs_blocks (page_id, type, data, order_index) values ($1,$2,$3,$4) returning id",
      [pageId, body.type, body.data ?? {}, body.orderIndex ?? 0]
    );
    await db.q("update docs_pages set updated_at=now() where id=$1", [pageId]);
    return { id: rows[0].id };
  });

  // ── PUT /browser/api/docs/pages/:id ───────────
  app.put("/browser/api/docs/pages/:id", async (req, reply) => {
    assertBrowserAuth(req);
    const id = (req.params as any).id;
    const body = req.body as any;
    const rows = await db.q(
      "update docs_pages set title=$2, updated_at=now() where id=$1 returning id, title",
      [id, body.title]
    );
    if (!rows[0]) { reply.code(404); return { error: "not found" }; }
    return rows[0];
  });

  // ── PUT /browser/api/docs/pages/:pageId/blocks/:blockId ───
  app.put("/browser/api/docs/pages/:pageId/blocks/:blockId", async (req, reply) => {
    assertBrowserAuth(req);
    const { pageId, blockId } = req.params as any;
    const body = req.body as any;
    const sets: string[] = [];
    const vals: any[] = [blockId];
    let i = 2;
    if (body.type !== undefined) { sets.push(`type=$${i++}`); vals.push(body.type); }
    if (body.data !== undefined) { sets.push(`data=$${i++}`); vals.push(body.data); }
    if (body.orderIndex !== undefined) { sets.push(`order_index=$${i++}`); vals.push(body.orderIndex); }
    if (sets.length === 0) { reply.code(400); return { error: "nothing to update" }; }
    const rows = await db.q(`update docs_blocks set ${sets.join(",")} where id=$1 returning id`, vals);
    if (!rows[0]) { reply.code(404); return { error: "not found" }; }
    await db.q("update docs_pages set updated_at=now() where id=$1", [pageId]);
    return { ok: true, id: rows[0].id };
  });

  // ── DELETE /browser/api/docs/pages/:pageId/blocks/:blockId ──
  app.delete("/browser/api/docs/pages/:pageId/blocks/:blockId", async (req, reply) => {
    assertBrowserAuth(req);
    const { pageId, blockId } = req.params as any;
    const rows = await db.q("delete from docs_blocks where id=$1 and page_id=$2 returning id", [blockId, pageId]);
    if (!rows[0]) { reply.code(404); return { error: "not found" }; }
    await db.q("update docs_pages set updated_at=now() where id=$1", [pageId]);
    return { ok: true };
  });

  // ── DELETE /browser/api/docs/pages/:id ────────
  app.delete("/browser/api/docs/pages/:id", async (req, reply) => {
    assertBrowserAuth(req);
    const id = (req.params as any).id;
    const rows = await db.q("delete from docs_pages where id=$1 returning id", [id]);
    if (!rows[0]) { reply.code(404); return { error: "not found" }; }
    return { ok: true };
  });

  // ═══════════════════════════════════════════════
  //  TABLES — list tables & get table with data
  // ═══════════════════════════════════════════════

  app.get("/browser/api/tables", async (req) => {
    assertBrowserAuth(req);
    const workspaceId = (req.query as any)?.workspaceId;
    const where = workspaceId ? "where t.workspace_id = $1" : "";
    const params = workspaceId ? [workspaceId] : [];
    const rows = await db.q(
      `select t.id, t.name, t.workspace_id, t.created_at,
              w.name as workspace_name
       from tables t
       left join workspaces w on w.id = t.workspace_id
       ${where}
       order by t.created_at desc`,
      params
    );
    return { tables: rows };
  });

  app.get("/browser/api/tables/:id", async (req, reply) => {
    assertBrowserAuth(req);
    const id = (req.params as any).id;
    const tables = await db.q(
      `select t.*, w.name as workspace_name
       from tables t
       left join workspaces w on w.id = t.workspace_id
       where t.id = $1`,
      [id]
    );
    if (!tables[0]) {
      reply.code(404);
      return { error: "not found" };
    }
    const columns = await db.q(
      "select id, name, type, order_index from table_columns where table_id = $1 order by order_index asc",
      [id]
    );
    const rowsList = await db.q(
      "select id, created_at from table_rows where table_id = $1 order by created_at asc",
      [id]
    );
    // Fetch all cells for these rows in one query
    const rowIds = rowsList.map((r: any) => r.id);
    let cells: any[] = [];
    if (rowIds.length > 0) {
      cells = await db.q(
        `select row_id, column_id, value from table_cells where row_id = ANY($1)`,
        [rowIds]
      );
    }
    // Group cells by row
    const cellsByRow: Record<string, Record<string, any>> = {};
    for (const c of cells) {
      if (!cellsByRow[c.row_id]) cellsByRow[c.row_id] = {};
      cellsByRow[c.row_id][c.column_id] = c.value;
    }
    const rows = rowsList.map((r: any) => ({
      id: r.id,
      created_at: r.created_at,
      cells: cellsByRow[r.id] || {},
    }));
    return { table: tables[0], columns, rows };
  });

  // ── POST /browser/api/tables (create) ──────────
  app.post("/browser/api/tables", async (req) => {
    assertBrowserAuth(req);
    const body = req.body as any;
    const rows = await db.q(
      "insert into tables (workspace_id, name) values ($1,$2) returning id",
      [body.workspaceId, body.name]
    );
    return { id: rows[0].id };
  });

  // ── POST /browser/api/tables/:id/columns ──────
  app.post("/browser/api/tables/:id/columns", async (req) => {
    assertBrowserAuth(req);
    const tableId = (req.params as any).id;
    const body = req.body as any;
    const rows = await db.q(
      "insert into table_columns (table_id, name, type, order_index) values ($1,$2,$3,$4) returning id",
      [tableId, body.name, body.type || "text", body.orderIndex ?? 0]
    );
    return { id: rows[0].id };
  });

  // ── POST /browser/api/tables/:id/rows ─────────
  app.post("/browser/api/tables/:id/rows", async (req) => {
    assertBrowserAuth(req);
    const tableId = (req.params as any).id;
    const body = req.body as any;
    const row = await db.q(
      "insert into table_rows (table_id) values ($1) returning id",
      [tableId]
    );
    const rowId = row[0].id;
    const cells = body.cells ?? {};
    for (const [columnId, value] of Object.entries(cells)) {
      await db.q(
        "insert into table_cells (row_id, column_id, value) values ($1,$2,$3)",
        [rowId, columnId, value]
      );
    }
    return { rowId };
  });

  // ── PUT /browser/api/tables/:tableId/rows/:rowId ─────
  app.put("/browser/api/tables/:tableId/rows/:rowId", async (req, reply) => {
    assertBrowserAuth(req);
    const { rowId } = req.params as any;
    const body = req.body as any;
    const cells = body.cells ?? {};
    const check = await db.q("select id from table_rows where id=$1", [rowId]);
    if (!check[0]) { reply.code(404); return { error: "row not found" }; }
    for (const [columnId, value] of Object.entries(cells)) {
      await db.q(
        `insert into table_cells (row_id, column_id, value) values ($1,$2,$3)
         on conflict (row_id, column_id) do update set value=$3`,
        [rowId, columnId, value]
      );
    }
    return { ok: true, rowId };
  });

  // ── DELETE /browser/api/tables/:tableId/rows/:rowId ──
  app.delete("/browser/api/tables/:tableId/rows/:rowId", async (req, reply) => {
    assertBrowserAuth(req);
    const { rowId } = req.params as any;
    const rows = await db.q("delete from table_rows where id=$1 returning id", [rowId]);
    if (!rows[0]) { reply.code(404); return { error: "not found" }; }
    return { ok: true };
  });

  // ── DELETE /browser/api/tables/:id ────────────
  app.delete("/browser/api/tables/:id", async (req, reply) => {
    assertBrowserAuth(req);
    const id = (req.params as any).id;
    const rows = await db.q("delete from tables where id=$1 returning id", [id]);
    if (!rows[0]) { reply.code(404); return { error: "not found" }; }
    return { ok: true };
  });

  // ═══════════════════════════════════════════════
  //  CALENDARS — list calendars & get events
  // ═══════════════════════════════════════════════

  app.get("/browser/api/calendars", async (req) => {
    assertBrowserAuth(req);
    const workspaceId = (req.query as any)?.workspaceId;
    const where = workspaceId ? "where c.workspace_id = $1" : "";
    const params = workspaceId ? [workspaceId] : [];
    const rows = await db.q(
      `select c.id, c.name, c.workspace_id,
              w.name as workspace_name
       from calendars c
       left join workspaces w on w.id = c.workspace_id
       ${where}
       order by c.name asc`,
      params
    );
    return { calendars: rows };
  });

  app.get("/browser/api/calendars/:id/events", async (req, reply) => {
    assertBrowserAuth(req);
    const id = (req.params as any).id;
    const cals = await db.q("select id from calendars where id = $1", [id]);
    if (!cals[0]) {
      reply.code(404);
      return { error: "not found" };
    }
    const from = (req.query as any)?.from || "1970-01-01T00:00:00Z";
    const to = (req.query as any)?.to || "2999-12-31T23:59:59Z";
    const events = await db.q(
      `select id, title, description, start_ts, end_ts
       from events
       where calendar_id = $1 and start_ts >= $2 and start_ts <= $3
       order by start_ts asc`,
      [id, from, to]
    );
    return { events };
  });

  // ── POST /browser/api/calendars (create) ──────
  app.post("/browser/api/calendars", async (req) => {
    assertBrowserAuth(req);
    const body = req.body as any;
    const rows = await db.q(
      "insert into calendars (workspace_id, name) values ($1,$2) returning id",
      [body.workspaceId, body.name]
    );
    return { id: rows[0].id };
  });

  // ── POST /browser/api/calendars/:id/events ────
  app.post("/browser/api/calendars/:id/events", async (req) => {
    assertBrowserAuth(req);
    const calendarId = (req.params as any).id;
    const body = req.body as any;
    const rows = await db.q(
      "insert into events (calendar_id, title, description, start_ts, end_ts) values ($1,$2,$3,$4,$5) returning id",
      [calendarId, body.title, body.description ?? null, body.startTs, body.endTs]
    );
    return { id: rows[0].id };
  });

  // ── PUT /browser/api/calendars/:calId/events/:eventId ─
  app.put("/browser/api/calendars/:calId/events/:eventId", async (req, reply) => {
    assertBrowserAuth(req);
    const { eventId } = req.params as any;
    const body = req.body as any;
    const sets: string[] = [];
    const vals: any[] = [eventId];
    let i = 2;
    if (body.title !== undefined) { sets.push(`title=$${i++}`); vals.push(body.title); }
    if (body.description !== undefined) { sets.push(`description=$${i++}`); vals.push(body.description); }
    if (body.startTs !== undefined) { sets.push(`start_ts=$${i++}`); vals.push(body.startTs); }
    if (body.endTs !== undefined) { sets.push(`end_ts=$${i++}`); vals.push(body.endTs); }
    if (sets.length === 0) { reply.code(400); return { error: "nothing to update" }; }
    const rows = await db.q(`update events set ${sets.join(",")} where id=$1 returning id`, vals);
    if (!rows[0]) { reply.code(404); return { error: "not found" }; }
    return rows[0];
  });

  // ── DELETE /browser/api/calendars/:id ─────────
  app.delete("/browser/api/calendars/:id", async (req, reply) => {
    assertBrowserAuth(req);
    const id = (req.params as any).id;
    const rows = await db.q("delete from calendars where id=$1 returning id", [id]);
    if (!rows[0]) { reply.code(404); return { error: "not found" }; }
    return { ok: true };
  });

  // ── DELETE /browser/api/calendars/:calId/events/:eventId
  app.delete("/browser/api/calendars/:calId/events/:eventId", async (req, reply) => {
    assertBrowserAuth(req);
    const { eventId } = req.params as any;
    const rows = await db.q("delete from events where id=$1 returning id", [eventId]);
    if (!rows[0]) { reply.code(404); return { error: "not found" }; }
    return { ok: true };
  });

  // ═══════════════════════════════════════════════
  //  EXPORT — Download docs as .md, tables as .csv, calendars as .ics
  // ═══════════════════════════════════════════════

  // ── GET /browser/api/docs/pages/:id/export/markdown ───
  app.get("/browser/api/docs/pages/:id/export/markdown", async (req, reply) => {
    assertBrowserAuth(req);
    const id = (req.params as any).id;
    const pages = await db.q("select * from docs_pages where id=$1", [id]);
    if (!pages[0]) { reply.code(404); return { error: "not found" }; }
    const page = pages[0];
    const blocks = await db.q(
      "select type, data, order_index from docs_blocks where page_id=$1 order by order_index asc",
      [id]
    );

    let md = `# ${page.title}\n\n`;
    for (const block of blocks) {
      const d = block.data || {};
      switch (block.type) {
        case "heading": {
          const level = d.level || 2;
          md += `${"#".repeat(level)} ${d.content || ""}\n\n`;
          break;
        }
        case "text":
          md += `${d.content || ""}\n\n`;
          break;
        case "list": {
          const items = d.items || (d.content ? d.content.split("\n") : []);
          for (const item of items) {
            const text = typeof item === "string" ? item : (item?.text || "");
            md += `- ${text}\n`;
          }
          md += "\n";
          break;
        }
        case "code":
          md += `\`\`\`${d.language || ""}\n${d.content || d.code || ""}\n\`\`\`\n\n`;
          break;
        case "image":
          md += `![${d.alt || "Image"}](${d.url || d.src || ""})\n\n`;
          break;
        case "table": {
          const headers = d.headers || [];
          const tblRows = d.rows || [];
          if (headers.length) {
            md += `| ${headers.join(" | ")} |\n`;
            md += `| ${headers.map(() => "---").join(" | ")} |\n`;
          }
          for (const row of tblRows) {
            const vals = Array.isArray(row) ? row : Object.values(row);
            md += `| ${vals.join(" | ")} |\n`;
          }
          md += "\n";
          break;
        }
        default:
          md += `${d.content || JSON.stringify(d)}\n\n`;
      }
    }

    const filename = (page.title || "document").replace(/[^\w.\-]+/g, "_") + ".md";
    reply.header("Content-Type", "text/markdown; charset=utf-8");
    reply.header("Content-Disposition", `attachment; filename="${filename}"`);
    return md;
  });

  // ── GET /browser/api/tables/:id/export/csv ────────────
  app.get("/browser/api/tables/:id/export/csv", async (req, reply) => {
    assertBrowserAuth(req);
    const id = (req.params as any).id;
    const tables = await db.q("select name from tables where id=$1", [id]);
    if (!tables[0]) { reply.code(404); return { error: "not found" }; }

    const columns = await db.q(
      "select id, name, type from table_columns where table_id=$1 order by order_index asc",
      [id]
    );
    const rowsList = await db.q(
      "select id from table_rows where table_id=$1 order by created_at asc",
      [id]
    );
    const rowIds = rowsList.map((r: any) => r.id);
    let cells: any[] = [];
    if (rowIds.length > 0) {
      cells = await db.q(
        "select row_id, column_id, value from table_cells where row_id = ANY($1)",
        [rowIds]
      );
    }
    const cellMap: Record<string, Record<string, any>> = {};
    for (const c of cells) {
      if (!cellMap[c.row_id]) cellMap[c.row_id] = {};
      cellMap[c.row_id][c.column_id] = c.value;
    }

    const csvEsc = (v: any) => {
      const s = v === null || v === undefined ? "" : String(typeof v === "object" ? (v.value ?? JSON.stringify(v)) : v);
      return s.includes(",") || s.includes('"') || s.includes("\n")
        ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = columns.map((c: any) => csvEsc(c.name)).join(",");
    const csvRows = rowIds.map((rid: string) =>
      columns.map((col: any) => csvEsc(cellMap[rid]?.[col.id])).join(",")
    );
    const csv = [header, ...csvRows].join("\n");
    const filename = (tables[0].name || "table").replace(/[^\w.\-]+/g, "_") + ".csv";

    reply.header("Content-Type", "text/csv; charset=utf-8");
    reply.header("Content-Disposition", `attachment; filename="${filename}"`);
    return csv;
  });

  // ── GET /browser/api/calendars/:id/export/ics ─────────
  app.get("/browser/api/calendars/:id/export/ics", async (req, reply) => {
    assertBrowserAuth(req);
    const id = (req.params as any).id;
    const cals = await db.q(
      "select c.name from calendars c where c.id=$1",
      [id]
    );
    if (!cals[0]) { reply.code(404); return { error: "not found" }; }

    const events = await db.q(
      "select id, title, description, start_ts, end_ts from events where calendar_id=$1 order by start_ts asc",
      [id]
    );

    // Format date to iCalendar format: 20260226T150000Z
    const icalDate = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    const icalEsc = (s: string) => (s || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");

    let ics = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//OpenClaw Workspace//EN\r\n";
    ics += `X-WR-CALNAME:${icalEsc(cals[0].name)}\r\n`;

    for (const ev of events) {
      ics += "BEGIN:VEVENT\r\n";
      ics += `UID:${ev.id}@workspace\r\n`;
      ics += `DTSTART:${icalDate(ev.start_ts)}\r\n`;
      ics += `DTEND:${icalDate(ev.end_ts)}\r\n`;
      ics += `SUMMARY:${icalEsc(ev.title)}\r\n`;
      if (ev.description) ics += `DESCRIPTION:${icalEsc(ev.description)}\r\n`;
      ics += "END:VEVENT\r\n";
    }
    ics += "END:VCALENDAR\r\n";

    const filename = (cals[0].name || "calendar").replace(/[^\w.\-]+/g, "_") + ".ics";
    reply.header("Content-Type", "text/calendar; charset=utf-8");
    reply.header("Content-Disposition", `attachment; filename="${filename}"`);
    return ics;
  });
}
