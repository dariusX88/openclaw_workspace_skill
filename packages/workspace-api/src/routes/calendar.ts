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

  /* ── Update an event ───────────────────────────── */
  app.put("/calendars/:calId/events/:eventId", async (req, reply) => {
    assertServiceAuth(req, serviceToken);
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
    const rows = await db.q(
      `update events set ${sets.join(",")} where id=$1 returning id, title, start_ts, end_ts`,
      vals
    );
    if (!rows[0]) { reply.code(404); return { error: "not found" }; }
    return rows[0];
  });

  /* ── Delete an event ───────────────────────────── */
  app.delete("/calendars/:calId/events/:eventId", async (req, reply) => {
    assertServiceAuth(req, serviceToken);
    const { eventId } = req.params as any;
    const rows = await db.q("delete from events where id=$1 returning id", [eventId]);
    if (!rows[0]) { reply.code(404); return { error: "not found" }; }
    return { ok: true };
  });

  /* ── Delete a calendar (cascades events) ───────── */
  app.delete("/calendars/:id", async (req, reply) => {
    assertServiceAuth(req, serviceToken);
    const id = (req.params as any).id;
    const rows = await db.q("delete from calendars where id=$1 returning id", [id]);
    if (!rows[0]) { reply.code(404); return { error: "not found" }; }
    return { ok: true };
  });
}
