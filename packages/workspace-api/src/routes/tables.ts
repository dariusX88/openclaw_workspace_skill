import type { FastifyInstance } from "fastify";
import { assertServiceAuth } from "../auth.js";

export async function tablesRoutes(app: FastifyInstance) {
  const { db, serviceToken } = app as any;

  app.post("/tables", async (req) => {
    assertServiceAuth(req, serviceToken);
    const body = req.body as any;
    const rows = await db.q<{ id: string }>(
      "insert into tables (workspace_id, name) values ($1,$2) returning id",
      [body.workspaceId, body.name]
    );
    return { id: rows[0].id };
  });

  app.post("/tables/:id/columns", async (req) => {
    assertServiceAuth(req, serviceToken);
    const tableId = (req.params as any).id;
    const body = req.body as any;
    const rows = await db.q<{ id: string }>(
      "insert into table_columns (table_id, name, type, order_index) values ($1,$2,$3,$4) returning id",
      [tableId, body.name, body.type, body.orderIndex ?? 0]
    );
    return { id: rows[0].id };
  });

  app.post("/tables/:id/rows", async (req) => {
    assertServiceAuth(req, serviceToken);
    const tableId = (req.params as any).id;
    const body = req.body as any;
    const row = await db.q<{ id: string }>(
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

  app.get("/tables/:id/rows", async (req) => {
    assertServiceAuth(req, serviceToken);
    const tableId = (req.params as any).id;
    const limit = Number((req.query as any).limit ?? 50);
    const rows = await db.q<any>(
      "select id, created_at from table_rows where table_id=$1 order by created_at desc limit $2",
      [tableId, limit]
    );
    const rowIds = rows.map((r: any) => r.id);
    let cells: any[] = [];
    if (rowIds.length) {
      cells = await db.q<any>(
        "select row_id, column_id, value from table_cells where row_id = any($1::uuid[])",
        [rowIds]
      );
    }
    return { rows, cells };
  });
}
