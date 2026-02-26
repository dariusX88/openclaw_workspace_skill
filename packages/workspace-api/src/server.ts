import Fastify from "fastify";
import multipart from "@fastify/multipart";
import { makeDb } from "./db.js";
import { healthRoutes } from "./routes/health.js";
import { docsRoutes } from "./routes/docs.js";
import { tablesRoutes } from "./routes/tables.js";
import { calendarRoutes } from "./routes/calendar.js";
import { filesRoutes } from "./routes/files.js";
import { workspacesRoutes } from "./routes/workspaces.js";
import { browserRoutes } from "./routes/browser.js";

const port = Number(process.env.PORT || 8080);
const dbUrl = process.env.DB_URL!;
const serviceToken = process.env.WORKSPACE_SERVICE_TOKEN!;
const filesDir = process.env.FILES_DIR || "/data/files";

if (!dbUrl) throw new Error("DB_URL missing");
if (!serviceToken) throw new Error("WORKSPACE_SERVICE_TOKEN missing");

const app = Fastify({ logger: true });

(app as any).db = makeDb(dbUrl);
(app as any).serviceToken = serviceToken;
(app as any).config = { FILES_DIR: filesDir };

await app.register(multipart, { limits: { fileSize: 50 * 1024 * 1024 } }); // 50MB

await app.register(healthRoutes);
await app.register(docsRoutes);
await app.register(tablesRoutes);
await app.register(calendarRoutes);
await app.register(filesRoutes);
await app.register(workspacesRoutes);
await app.register(browserRoutes);

app.setErrorHandler((err, req, reply) => {
  const e = err as any;
  const code = e?.statusCode || 500;
  reply.code(code).send({ error: e?.message || "error" });
});

app.listen({ port, host: "0.0.0.0" });
