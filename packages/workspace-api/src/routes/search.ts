import type { FastifyInstance } from "fastify";
import { assertServiceAuth } from "../auth.js";

export async function searchRoutes(app: FastifyInstance) {
  const { db, serviceToken } = app as any;

  /**
   * GET /search?q=keyword&workspaceId=optional
   *
   * Searches across doc pages, doc blocks, table names, event titles,
   * and file names. Uses Postgres full-text search where available,
   * falls back to ILIKE for tables/files.
   */
  app.get("/search", async (req, reply) => {
    assertServiceAuth(req, serviceToken);
    const q = ((req.query as any)?.q || "").trim();
    if (!q) {
      reply.code(400);
      return { error: "q parameter required" };
    }
    const workspaceId = (req.query as any)?.workspaceId;

    // Build the tsquery for FTS
    const tsq = q
      .split(/\s+/)
      .map((w: string) => w.replace(/[^\w]/g, ""))
      .filter(Boolean)
      .join(" & ");

    const wsFilter = workspaceId ? " and workspace_id = $2" : "";
    const wsFilterCal = workspaceId
      ? " and c.workspace_id = $2"
      : "";
    const params = workspaceId ? [tsq, workspaceId] : [tsq];
    const ilike = `%${q}%`;
    const iParams = workspaceId ? [ilike, workspaceId] : [ilike];

    // Run all searches in parallel
    const [pages, blocks, tables, events, files] = await Promise.all([
      // Doc pages (FTS on title)
      db.q(
        `select id, title, workspace_id, 'page' as type, created_at
         from docs_pages
         where search_tsv @@ to_tsquery('simple', $1)${wsFilter}
         order by created_at desc limit 20`,
        params
      ).catch(() =>
        // Fallback if FTS columns not yet added (migration not run)
        db.q(
          `select id, title, workspace_id, 'page' as type, created_at
           from docs_pages
           where title ilike $1${wsFilter}
           order by created_at desc limit 20`,
          iParams
        )
      ),
      // Doc blocks (FTS on content)
      db.q(
        `select b.id, b.page_id, p.title as page_title, p.workspace_id,
                'block' as type, substring(b.data->>'content' from 1 for 200) as snippet
         from docs_blocks b
         join docs_pages p on p.id = b.page_id
         where b.search_tsv @@ to_tsquery('simple', $1)${workspaceId ? " and p.workspace_id = $2" : ""}
         order by b.order_index asc limit 20`,
        params
      ).catch(() =>
        db.q(
          `select b.id, b.page_id, p.title as page_title, p.workspace_id,
                  'block' as type, substring(b.data->>'content' from 1 for 200) as snippet
           from docs_blocks b
           join docs_pages p on p.id = b.page_id
           where (b.data->>'content') ilike $1${workspaceId ? " and p.workspace_id = $2" : ""}
           limit 20`,
          iParams
        )
      ),
      // Tables (name ILIKE — no FTS column needed)
      db.q(
        `select id, name, workspace_id, 'table' as type, created_at
         from tables
         where name ilike $1${wsFilter.replace("$2", workspaceId ? "$2" : "")}
         order by created_at desc limit 20`,
        iParams
      ),
      // Events (FTS on title+description)
      db.q(
        `select e.id, e.title, e.start_ts, e.end_ts, c.workspace_id,
                'event' as type
         from events e
         join calendars c on c.id = e.calendar_id
         where e.search_tsv @@ to_tsquery('simple', $1)${wsFilterCal}
         order by e.start_ts desc limit 20`,
        params
      ).catch(() =>
        db.q(
          `select e.id, e.title, e.start_ts, e.end_ts, c.workspace_id,
                  'event' as type
           from events e
           join calendars c on c.id = e.calendar_id
           where (e.title ilike $1 or e.description ilike $1)${wsFilterCal.replace("$2", workspaceId ? "$2" : "")}
           order by e.start_ts desc limit 20`,
          iParams
        )
      ),
      // Files (filename ILIKE)
      db.q(
        `select id, filename, workspace_id, content_type, size_bytes,
                'file' as type, created_at
         from files
         where filename ilike $1${wsFilter.replace("$2", workspaceId ? "$2" : "")}
         order by created_at desc limit 20`,
        iParams
      ),
    ]);

    return {
      query: q,
      results: {
        pages,
        blocks,
        tables,
        events,
        files,
      },
      total: pages.length + blocks.length + tables.length + events.length + files.length,
    };
  });
}
