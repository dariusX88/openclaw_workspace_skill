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
}
