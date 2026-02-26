import type { FastifyInstance } from "fastify";
import { assertServiceAuth } from "../auth.js";

export async function docsRoutes(app: FastifyInstance) {
  const { db, serviceToken } = app as any;

  app.post("/docs/pages", async (req, reply) => {
    assertServiceAuth(req, serviceToken);
    const body = req.body as any;
    const rows = await db.q(
      "insert into docs_pages (workspace_id, title) values ($1,$2) returning id",
      [body.workspaceId, body.title]
    );
    return { id: rows[0].id };
  });

  app.post("/docs/pages/:id/blocks", async (req) => {
    assertServiceAuth(req, serviceToken);
    const pageId = (req.params as any).id;
    const body = req.body as any;
    const rows = await db.q(
      "insert into docs_blocks (page_id, type, data, order_index) values ($1,$2,$3,$4) returning id",
      [pageId, body.type, body.data ?? {}, body.orderIndex ?? 0]
    );
    return { id: rows[0].id };
  });

  app.get("/docs/pages/:id", async (req) => {
    assertServiceAuth(req, serviceToken);
    const pageId = (req.params as any).id;
    const pages = await db.q("select * from docs_pages where id=$1", [
      pageId,
    ]);
    const blocks = await db.q(
      "select * from docs_blocks where page_id=$1 order by order_index asc",
      [pageId]
    );
    return { page: pages[0] ?? null, blocks };
  });

  /* ── List all pages in a workspace ─────────────── */
  app.get("/docs/pages", async (req) => {
    assertServiceAuth(req, serviceToken);
    const workspaceId = (req.query as any)?.workspaceId;
    if (workspaceId) {
      const rows = await db.q(
        "select id, workspace_id, title, created_at, updated_at from docs_pages where workspace_id=$1 order by updated_at desc nulls last",
        [workspaceId]
      );
      return { pages: rows };
    }
    const rows = await db.q(
      "select id, workspace_id, title, created_at, updated_at from docs_pages order by updated_at desc nulls last limit 200"
    );
    return { pages: rows };
  });

  /* ── Update page title ─────────────────────────── */
  app.put("/docs/pages/:id", async (req, reply) => {
    assertServiceAuth(req, serviceToken);
    const id = (req.params as any).id;
    const body = req.body as any;
    const rows = await db.q(
      "update docs_pages set title=$2, updated_at=now() where id=$1 returning id, title, updated_at",
      [id, body.title]
    );
    if (!rows[0]) { reply.code(404); return { error: "not found" }; }
    return rows[0];
  });

  /* ── Update a block ────────────────────────────── */
  app.put("/docs/pages/:pageId/blocks/:blockId", async (req, reply) => {
    assertServiceAuth(req, serviceToken);
    const { pageId, blockId } = req.params as any;
    const body = req.body as any;
    const sets: string[] = [];
    const vals: any[] = [blockId];
    let i = 2;
    if (body.type !== undefined) { sets.push(`type=$${i++}`); vals.push(body.type); }
    if (body.data !== undefined) { sets.push(`data=$${i++}`); vals.push(body.data); }
    if (body.orderIndex !== undefined) { sets.push(`order_index=$${i++}`); vals.push(body.orderIndex); }
    if (sets.length === 0) { reply.code(400); return { error: "nothing to update" }; }
    const rows = await db.q(
      `update docs_blocks set ${sets.join(",")} where id=$1 returning id`,
      vals
    );
    if (!rows[0]) { reply.code(404); return { error: "not found" }; }
    // Touch the parent page
    await db.q("update docs_pages set updated_at=now() where id=$1", [pageId]);
    return { ok: true, id: rows[0].id };
  });

  /* ── Delete a page (cascades blocks) ───────────── */
  app.delete("/docs/pages/:id", async (req, reply) => {
    assertServiceAuth(req, serviceToken);
    const id = (req.params as any).id;
    const rows = await db.q("delete from docs_pages where id=$1 returning id", [id]);
    if (!rows[0]) { reply.code(404); return { error: "not found" }; }
    return { ok: true };
  });

  /* ── Delete a block ────────────────────────────── */
  app.delete("/docs/pages/:pageId/blocks/:blockId", async (req, reply) => {
    assertServiceAuth(req, serviceToken);
    const { pageId, blockId } = req.params as any;
    const rows = await db.q("delete from docs_blocks where id=$1 and page_id=$2 returning id", [blockId, pageId]);
    if (!rows[0]) { reply.code(404); return { error: "not found" }; }
    await db.q("update docs_pages set updated_at=now() where id=$1", [pageId]);
    return { ok: true };
  });
}
