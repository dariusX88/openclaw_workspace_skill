import type { FastifyInstance } from "fastify";
import { assertServiceAuth } from "../auth.js";

export async function workspacesRoutes(app: FastifyInstance) {
  const { db, serviceToken } = app as any;

  app.post("/workspaces", async (req) => {
    assertServiceAuth(req, serviceToken);
    const body = req.body as any;
    const rows = await db.q(
      "insert into workspaces (name) values ($1) returning id, name, created_at",
      [body.name]
    );
    return rows[0];
  });

  app.get("/workspaces", async (req) => {
    assertServiceAuth(req, serviceToken);
    const rows = await db.q(
      "select id, name, created_at from workspaces order by created_at desc"
    );
    return { workspaces: rows };
  });

  app.put("/workspaces/:id", async (req, reply) => {
    assertServiceAuth(req, serviceToken);
    const id = (req.params as any).id;
    const body = req.body as any;
    const rows = await db.q(
      "update workspaces set name=$2 where id=$1 returning id, name, created_at",
      [id, body.name]
    );
    if (!rows[0]) { reply.code(404); return { error: "not found" }; }
    return rows[0];
  });

  app.delete("/workspaces/:id", async (req, reply) => {
    assertServiceAuth(req, serviceToken);
    const id = (req.params as any).id;
    const rows = await db.q("delete from workspaces where id=$1 returning id", [id]);
    if (!rows[0]) { reply.code(404); return { error: "not found" }; }
    return { ok: true };
  });
}
