import type { FastifyInstance } from "fastify";
import { assertServiceAuth } from "../auth.js";

export async function calendarRoutes(app: FastifyInstance) {
  const { db, serviceToken } = app as any;

  app.post("/calendars", async (req) => {
    assertServiceAuth(req, serviceToken);
    const body = req.body as any;
    const rows = await db.q(
      "insert into calendars (workspace_id, name) values ($1,$2) returning id",
      [body.workspaceId, body.name]
    );
    return { id: rows[0].id };
  });

  app.post("/calendars/:id/events", async (req) => {
    assertServiceAuth(req, serviceToken);
    const calendarId = (req.params as any).id;
    const body = req.body as any;
    const rows = await db.q(
      "insert into events (calendar_id, title, description, start_ts, end_ts) values ($1,$2,$3,$4,$5) returning id",
      [
        calendarId,
        body.title,
        body.description ?? null,
        body.startTs,
        body.endTs,
      ]
    );
    return { id: rows[0].id };
  });

  app.get("/calendars/:id/events", async (req) => {
    assertServiceAuth(req, serviceToken);
    const calendarId = (req.params as any).id;
    const { from, to } = (req.query as any) ?? {};
    const rows = await db.q(
      "select * from events where calendar_id=$1 and start_ts >= $2 and end_ts <= $3 order by start_ts asc",
      [calendarId, from ?? "1970-01-01", to ?? "2999-12-31"]
    );
    return { events: rows };
  });
}
