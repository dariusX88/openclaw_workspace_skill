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
}
