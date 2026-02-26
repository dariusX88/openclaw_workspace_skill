import type { FastifyInstance } from "fastify";
import { assertServiceAuth } from "../auth.js";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import pdfParse from "pdf-parse";

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

  app.get("/files", async (req) => {
    assertServiceAuth(req, serviceToken);
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

  /* ── Extract text from a file (PDF → plain text) ── */
  app.get("/files/:id/text", async (req, reply) => {
    assertServiceAuth(req, serviceToken);
    const id = (req.params as any).id;
    const rows = await db.q("select * from files where id=$1", [id]);
    if (!rows[0]) {
      reply.code(404);
      return { error: "not found" };
    }
    const f = rows[0];

    // Only PDFs are supported for now
    const isPdf =
      f.content_type === "application/pdf" ||
      (f.filename && f.filename.toLowerCase().endsWith(".pdf"));
    if (!isPdf) {
      reply.code(400);
      return {
        error: "Text extraction only supports PDF files",
        filename: f.filename,
        content_type: f.content_type,
      };
    }

    try {
      const buffer = await fs.promises.readFile(f.storage_path);
      const parsed = await pdfParse(buffer);
      return {
        id: f.id,
        filename: f.filename,
        pages: parsed.numpages,
        text: parsed.text,
      };
    } catch (err: any) {
      reply.code(500);
      return { error: "Failed to extract text", detail: err.message };
    }
  });

  /* ── Delete a file (disk + DB) ─────────────────── */
  app.delete("/files/:id", async (req, reply) => {
    assertServiceAuth(req, serviceToken);
    const id = (req.params as any).id;
    const rows = await db.q("select * from files where id=$1", [id]);
    if (!rows[0]) { reply.code(404); return { error: "not found" }; }
    try { await fs.promises.unlink(rows[0].storage_path); } catch {}
    await db.q("delete from files where id=$1", [id]);
    return { ok: true };
  });
}
