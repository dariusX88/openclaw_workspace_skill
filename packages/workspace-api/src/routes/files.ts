import type { FastifyInstance } from "fastify";
import { assertServiceAuth } from "../auth.js";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export async function filesRoutes(app: FastifyInstance) {
  const { db, serviceToken } = app as any;
  const filesDir = (app as any).config.FILES_DIR as string;

  app.post("/files", async (req, reply) => {
    assertServiceAuth(req, serviceToken);
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
    return { id: rows[0].id };
  });

  app.get("/files/:id/download", async (req, reply) => {
    assertServiceAuth(req, serviceToken);
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
}
