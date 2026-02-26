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
}
