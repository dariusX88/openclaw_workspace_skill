---
name: Workspace
description: Native workspace with docs, tables, calendar, and file storage. Full CRUD, search, and export. No Google required.
---

# Workspace API

Base URL: http://localhost:8082
All requests require header: Authorization: Bearer {{WORKSPACE_SERVICE_TOKEN}}

---

## Workspaces

### Create a Workspace

```bash
curl -s -X POST "http://localhost:8082/workspaces" -H "Content-Type: application/json" -H "Authorization: Bearer {{WORKSPACE_SERVICE_TOKEN}}" -d "{\"name\": \"WORKSPACE_NAME\"}"
```

Returns: `{"id": "uuid", "name": "...", "created_at": "..."}`

### List Workspaces

```bash
curl -s -X GET "http://localhost:8082/workspaces" -H "Authorization: Bearer {{WORKSPACE_SERVICE_TOKEN}}"
```

Returns: `{"workspaces": [...]}`

### Rename a Workspace

```bash
curl -s -X PUT "http://localhost:8082/workspaces/WORKSPACE_ID" -H "Content-Type: application/json" -H "Authorization: Bearer {{WORKSPACE_SERVICE_TOKEN}}" -d "{\"name\": \"NEW_NAME\"}"
```

### Delete a Workspace

```bash
curl -s -X DELETE "http://localhost:8082/workspaces/WORKSPACE_ID" -H "Authorization: Bearer {{WORKSPACE_SERVICE_TOKEN}}"
```

Deletes the workspace and all its docs, tables, calendars, and files (cascade).

---

## Docs (Notion-lite)

### Create a Page

```bash
curl -s -X POST "http://localhost:8082/docs/pages" -H "Content-Type: application/json" -H "Authorization: Bearer {{WORKSPACE_SERVICE_TOKEN}}" -d "{\"workspaceId\": \"WORKSPACE_ID\", \"title\": \"PAGE_TITLE\"}"
```

### Add a Block to a Page

```bash
curl -s -X POST "http://localhost:8082/docs/pages/PAGE_ID/blocks" -H "Content-Type: application/json" -H "Authorization: Bearer {{WORKSPACE_SERVICE_TOKEN}}" -d "{\"type\": \"text\", \"data\": {\"content\": \"Block content here\"}, \"orderIndex\": 0}"
```

Block types: `text`, `heading`, `list`, `code`, `image`, `table`

### Get a Page with Blocks

```bash
curl -s -X GET "http://localhost:8082/docs/pages/PAGE_ID" -H "Authorization: Bearer {{WORKSPACE_SERVICE_TOKEN}}"
```

### List All Pages

```bash
curl -s -X GET "http://localhost:8082/docs/pages?workspaceId=WORKSPACE_ID" -H "Authorization: Bearer {{WORKSPACE_SERVICE_TOKEN}}"
```

Returns: `{"pages": [{id, title, workspace_id, created_at, updated_at}, ...]}`
Omit workspaceId to list pages across all workspaces (max 200).

### Update Page Title

```bash
curl -s -X PUT "http://localhost:8082/docs/pages/PAGE_ID" -H "Content-Type: application/json" -H "Authorization: Bearer {{WORKSPACE_SERVICE_TOKEN}}" -d "{\"title\": \"NEW_TITLE\"}"
```

### Update a Block

```bash
curl -s -X PUT "http://localhost:8082/docs/pages/PAGE_ID/blocks/BLOCK_ID" -H "Content-Type: application/json" -H "Authorization: Bearer {{WORKSPACE_SERVICE_TOKEN}}" -d "{\"type\": \"text\", \"data\": {\"content\": \"Updated content\"}, \"orderIndex\": 1}"
```

All fields are optional — only provided fields are updated.

### Delete a Page

```bash
curl -s -X DELETE "http://localhost:8082/docs/pages/PAGE_ID" -H "Authorization: Bearer {{WORKSPACE_SERVICE_TOKEN}}"
```

Deletes the page and all its blocks (cascade).

### Delete a Block

```bash
curl -s -X DELETE "http://localhost:8082/docs/pages/PAGE_ID/blocks/BLOCK_ID" -H "Authorization: Bearer {{WORKSPACE_SERVICE_TOKEN}}"
```

### Export Page as Markdown

```bash
curl -s -X GET "http://localhost:8082/docs/pages/PAGE_ID/export/markdown" -H "Authorization: Bearer {{WORKSPACE_SERVICE_TOKEN}}" -o page.md
```

Downloads the page content as a formatted Markdown file.

---

## Tables (Sheet-lite)

### Create a Table

```bash
curl -s -X POST "http://localhost:8082/tables" -H "Content-Type: application/json" -H "Authorization: Bearer {{WORKSPACE_SERVICE_TOKEN}}" -d "{\"workspaceId\": \"WORKSPACE_ID\", \"name\": \"TABLE_NAME\"}"
```

### Add Columns

```bash
curl -s -X POST "http://localhost:8082/tables/TABLE_ID/columns" -H "Content-Type: application/json" -H "Authorization: Bearer {{WORKSPACE_SERVICE_TOKEN}}" -d "{\"name\": \"COLUMN_NAME\", \"type\": \"text\", \"orderIndex\": 0}"
```

Column types: `text`, `number`, `date`, `boolean`, `select`, `url`

### Add a Row with Cell Values

```bash
curl -s -X POST "http://localhost:8082/tables/TABLE_ID/rows" -H "Content-Type: application/json" -H "Authorization: Bearer {{WORKSPACE_SERVICE_TOKEN}}" -d "{\"cells\": {\"COLUMN_ID\": \"cell value\"}}"
```

### Get Rows

```bash
curl -s -X GET "http://localhost:8082/tables/TABLE_ID/rows?limit=50" -H "Authorization: Bearer {{WORKSPACE_SERVICE_TOKEN}}"
```

### Rename a Table

```bash
curl -s -X PUT "http://localhost:8082/tables/TABLE_ID" -H "Content-Type: application/json" -H "Authorization: Bearer {{WORKSPACE_SERVICE_TOKEN}}" -d "{\"name\": \"NEW_TABLE_NAME\"}"
```

### Update Row Cells

```bash
curl -s -X PUT "http://localhost:8082/tables/TABLE_ID/rows/ROW_ID" -H "Content-Type: application/json" -H "Authorization: Bearer {{WORKSPACE_SERVICE_TOKEN}}" -d "{\"cells\": {\"COLUMN_ID\": \"new value\"}}"
```

Only provided cells are updated (upsert). Existing cells not in the request are unchanged.

### Delete a Row

```bash
curl -s -X DELETE "http://localhost:8082/tables/TABLE_ID/rows/ROW_ID" -H "Authorization: Bearer {{WORKSPACE_SERVICE_TOKEN}}"
```

### Delete a Table

```bash
curl -s -X DELETE "http://localhost:8082/tables/TABLE_ID" -H "Authorization: Bearer {{WORKSPACE_SERVICE_TOKEN}}"
```

Deletes the table, all its columns, rows, and cells (cascade).

### Export Table as CSV

```bash
curl -s -X GET "http://localhost:8082/tables/TABLE_ID/export/csv" -H "Authorization: Bearer {{WORKSPACE_SERVICE_TOKEN}}" -o table.csv
```

Downloads all table data as a CSV file with column headers.

---

## Calendar

### Create a Calendar

```bash
curl -s -X POST "http://localhost:8082/calendars" -H "Content-Type: application/json" -H "Authorization: Bearer {{WORKSPACE_SERVICE_TOKEN}}" -d "{\"workspaceId\": \"WORKSPACE_ID\", \"name\": \"CALENDAR_NAME\"}"
```

### Create an Event

```bash
curl -s -X POST "http://localhost:8082/calendars/CALENDAR_ID/events" -H "Content-Type: application/json" -H "Authorization: Bearer {{WORKSPACE_SERVICE_TOKEN}}" -d "{\"title\": \"EVENT_TITLE\", \"description\": \"DESCRIPTION\", \"startTs\": \"2026-03-01T09:00:00Z\", \"endTs\": \"2026-03-01T10:00:00Z\"}"
```

### List Events (with date range filter)

```bash
curl -s -X GET "http://localhost:8082/calendars/CALENDAR_ID/events?from=2026-03-01T00:00:00Z&to=2026-03-31T23:59:59Z" -H "Authorization: Bearer {{WORKSPACE_SERVICE_TOKEN}}"
```

### Update an Event

```bash
curl -s -X PUT "http://localhost:8082/calendars/CALENDAR_ID/events/EVENT_ID" -H "Content-Type: application/json" -H "Authorization: Bearer {{WORKSPACE_SERVICE_TOKEN}}" -d "{\"title\": \"NEW_TITLE\", \"startTs\": \"2026-03-02T10:00:00Z\", \"endTs\": \"2026-03-02T11:00:00Z\"}"
```

All fields are optional — only provided fields are updated. Supported: `title`, `description`, `startTs`, `endTs`.

### Delete an Event

```bash
curl -s -X DELETE "http://localhost:8082/calendars/CALENDAR_ID/events/EVENT_ID" -H "Authorization: Bearer {{WORKSPACE_SERVICE_TOKEN}}"
```

### Delete a Calendar

```bash
curl -s -X DELETE "http://localhost:8082/calendars/CALENDAR_ID" -H "Authorization: Bearer {{WORKSPACE_SERVICE_TOKEN}}"
```

Deletes the calendar and all its events (cascade).

---

## Files

### List Files in a Workspace

```bash
curl -s -X GET "http://localhost:8082/files?workspaceId=WORKSPACE_ID" -H "Authorization: Bearer {{WORKSPACE_SERVICE_TOKEN}}"
```

### Upload a File

```bash
curl -s -X POST "http://localhost:8082/files?workspaceId=WORKSPACE_ID" -H "Authorization: Bearer {{WORKSPACE_SERVICE_TOKEN}}" -F "file=@/path/to/file.pdf"
```

### Download a File

```bash
curl -s -X GET "http://localhost:8082/files/FILE_ID/download" -H "Authorization: Bearer {{WORKSPACE_SERVICE_TOKEN}}" -o output_filename
```

### Extract Text from a PDF File

```bash
curl -s -X GET "http://localhost:8082/files/FILE_ID/text" -H "Authorization: Bearer {{WORKSPACE_SERVICE_TOKEN}}"
```

Returns: `{"id": "uuid", "filename": "doc.pdf", "pages": 5, "text": "extracted plain text..."}`

Use this to read the contents of uploaded PDF files. Only PDF files are supported.

### Delete a File

```bash
curl -s -X DELETE "http://localhost:8082/files/FILE_ID" -H "Authorization: Bearer {{WORKSPACE_SERVICE_TOKEN}}"
```

Deletes the file from disk and database.

---

## Search

### Search Across Workspace

```bash
curl -s -X GET "http://localhost:8082/search?q=KEYWORD&workspaceId=WORKSPACE_ID" -H "Authorization: Bearer {{WORKSPACE_SERVICE_TOKEN}}"
```

Searches across doc pages, doc blocks, table names, calendar events, and file names. Returns categorized results:

```json
{
  "query": "KEYWORD",
  "results": {
    "pages": [...],
    "blocks": [...],
    "tables": [...],
    "events": [...],
    "files": [...]
  },
  "total": 12
}
```

The `workspaceId` parameter is optional — omit it to search across all workspaces.

---

## Dashboard (for the user)

The workspace has a web dashboard where the user can visually browse and download everything you create.

**Dashboard URL: {{DASHBOARD_URL}}**

IMPORTANT BEHAVIOR RULES — you MUST follow these:

1. **ALWAYS provide the dashboard link after creating or modifying content.** Every time you create a workspace, doc, table, calendar, event, or upload a file, include this in your response:
   "You can view and download your content at: {{DASHBOARD_URL}}"

2. **When the user asks to see, open, view, or check their workspace**, immediately reply with the dashboard link. Do NOT try to read the data and display it — direct them to the dashboard instead.

3. **The dashboard supports downloading:**
   - Docs → download as `.md` (Markdown)
   - Tables → download as `.csv` (spreadsheet)
   - Calendars → download as `.ics` (importable to Google Calendar, Outlook, Apple Calendar)
   - Files → direct download

4. **Never guess or change the dashboard URL.** Always use exactly: {{DASHBOARD_URL}}

The user logs in with the service token. The dashboard has tabs for Files, Docs, Tables, and Calendar, with dark mode, create forms, auto-refresh, and download buttons.
