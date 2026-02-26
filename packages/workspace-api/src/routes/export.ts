import type { FastifyInstance } from "fastify";
import { assertServiceAuth } from "../auth.js";

export async function exportRoutes(app: FastifyInstance) {
  const { db, serviceToken } = app as any;

  /**
   * GET /tables/:id/export/csv
   * Download table data as a CSV file
   */
  app.get("/tables/:id/export/csv", async (req, reply) => {
    assertServiceAuth(req, serviceToken);
    const id = (req.params as any).id;

    const tables = await db.q("select name from tables where id=$1", [id]);
    if (!tables[0]) { reply.code(404); return { error: "not found" }; }

    const columns = await db.q(
      "select id, name, type from table_columns where table_id=$1 order by order_index asc",
      [id]
    );
    const rowsList = await db.q(
      "select id from table_rows where table_id=$1 order by created_at asc",
      [id]
    );
    const rowIds = rowsList.map((r: any) => r.id);
    let cells: any[] = [];
    if (rowIds.length > 0) {
      cells = await db.q(
        "select row_id, column_id, value from table_cells where row_id = ANY($1)",
        [rowIds]
      );
    }
    const cellMap: Record<string, Record<string, any>> = {};
    for (const c of cells) {
      if (!cellMap[c.row_id]) cellMap[c.row_id] = {};
      cellMap[c.row_id][c.column_id] = c.value;
    }

    // Build CSV
    const escape = (v: any) => {
      const s = v === null || v === undefined ? "" : String(typeof v === "object" ? (v.value ?? JSON.stringify(v)) : v);
      return s.includes(",") || s.includes('"') || s.includes("\n")
        ? `"${s.replace(/"/g, '""')}"` : s;
    };

    const header = columns.map((c: any) => escape(c.name)).join(",");
    const rows = rowIds.map((rid: string) => {
      return columns.map((col: any) => {
        const val = cellMap[rid]?.[col.id];
        return escape(val);
      }).join(",");
    });

    const csv = [header, ...rows].join("\n");
    const filename = (tables[0].name || "table").replace(/[^\w.-]+/g, "_") + ".csv";

    reply.header("Content-Type", "text/csv; charset=utf-8");
    reply.header("Content-Disposition", `attachment; filename="${filename}"`);
    return csv;
  });

  /**
   * GET /docs/pages/:id/export/markdown
   * Download a doc page as Markdown
   */
  app.get("/docs/pages/:id/export/markdown", async (req, reply) => {
    assertServiceAuth(req, serviceToken);
    const id = (req.params as any).id;

    const pages = await db.q("select * from docs_pages where id=$1", [id]);
    if (!pages[0]) { reply.code(404); return { error: "not found" }; }
    const page = pages[0];

    const blocks = await db.q(
      "select type, data, order_index from docs_blocks where page_id=$1 order by order_index asc",
      [id]
    );

    let md = `# ${page.title}\n\n`;

    for (const block of blocks) {
      const d = block.data || {};
      switch (block.type) {
        case "heading": {
          const level = d.level || 2;
          md += `${"#".repeat(level)} ${d.content || ""}\n\n`;
          break;
        }
        case "text":
          md += `${d.content || ""}\n\n`;
          break;
        case "list": {
          const items = d.items || (d.content ? d.content.split("\n") : []);
          for (const item of items) {
            const text = typeof item === "string" ? item : (item?.text || "");
            md += `- ${text}\n`;
          }
          md += "\n";
          break;
        }
        case "code":
          md += `\`\`\`${d.language || ""}\n${d.content || d.code || ""}\n\`\`\`\n\n`;
          break;
        case "image":
          md += `![${d.alt || "Image"}](${d.url || d.src || ""})\n\n`;
          break;
        case "table": {
          const headers = d.headers || [];
          const rows = d.rows || [];
          if (headers.length) {
            md += `| ${headers.join(" | ")} |\n`;
            md += `| ${headers.map(() => "---").join(" | ")} |\n`;
          }
          for (const row of rows) {
            const vals = Array.isArray(row) ? row : Object.values(row);
            md += `| ${vals.join(" | ")} |\n`;
          }
          md += "\n";
          break;
        }
        default:
          md += `${d.content || JSON.stringify(d)}\n\n`;
      }
    }

    const filename = (page.title || "document").replace(/[^\w.-]+/g, "_") + ".md";
    reply.header("Content-Type", "text/markdown; charset=utf-8");
    reply.header("Content-Disposition", `attachment; filename="${filename}"`);
    return md;
  });
}
