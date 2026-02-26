---
name: Workspace
description: Native workspace with docs, tables, calendar, and file storage. No Google required.
---

# Workspace API

Base URL: http://localhost:8081
All requests require header: Authorization: Bearer {{WORKSPACE_SERVICE_TOKEN}}

## First: Create a Workspace

```bash
curl -s -X POST "http://localhost:8081/workspaces" -H "Content-Type: application/json" -H "Authorization: Bearer {{WORKSPACE_SERVICE_TOKEN}}" -d "{\"name\": \"WORKSPACE_NAME\"}"
```

Returns: `{"id": "uuid"}`  — save this workspace ID for all other operations.

---

## Docs (Notion-lite)

### Create a Page

```bash
curl -s -X POST "http://localhost:8081/docs/pages" -H "Content-Type: application/json" -H "Authorization: Bearer {{WORKSPACE_SERVICE_TOKEN}}" -d "{\"workspaceId\": \"WORKSPACE_ID\", \"title\": \"PAGE_TITLE\"}"
```

### Add a Block to a Page

```bash
curl -s -X POST "http://localhost:8081/docs/pages/PAGE_ID/blocks" -H "Content-Type: application/json" -H "Authorization: Bearer {{WORKSPACE_SERVICE_TOKEN}}" -d "{\"type\": \"text\", \"data\": {\"content\": \"Block content here\"}, \"orderIndex\": 0}"
```

Block types: `text`, `heading`, `list`, `code`, `image`, `table`

### Get a Page with Blocks

```bash
curl -s -X GET "http://localhost:8081/docs/pages/PAGE_ID" -H "Authorization: Bearer {{WORKSPACE_SERVICE_TOKEN}}"
```

---

## Tables (Sheet-lite)

### Create a Table

```bash
curl -s -X POST "http://localhost:8081/tables" -H "Content-Type: application/json" -H "Authorization: Bearer {{WORKSPACE_SERVICE_TOKEN}}" -d "{\"workspaceId\": \"WORKSPACE_ID\", \"name\": \"TABLE_NAME\"}"
```

### Add Columns

```bash
curl -s -X POST "http://localhost:8081/tables/TABLE_ID/columns" -H "Content-Type: application/json" -H "Authorization: Bearer {{WORKSPACE_SERVICE_TOKEN}}" -d "{\"name\": \"COLUMN_NAME\", \"type\": \"text\", \"orderIndex\": 0}"
```

Column types: `text`, `number`, `date`, `boolean`, `select`, `url`

### Add a Row with Cell Values

```bash
curl -s -X POST "http://localhost:8081/tables/TABLE_ID/rows" -H "Content-Type: application/json" -H "Authorization: Bearer {{WORKSPACE_SERVICE_TOKEN}}" -d "{\"cells\": {\"COLUMN_ID\": \"cell value\"}}"
```

### Get Rows

```bash
curl -s -X GET "http://localhost:8081/tables/TABLE_ID/rows?limit=50" -H "Authorization: Bearer {{WORKSPACE_SERVICE_TOKEN}}"
```

---

## Calendar

### Create a Calendar

```bash
curl -s -X POST "http://localhost:8081/calendars" -H "Content-Type: application/json" -H "Authorization: Bearer {{WORKSPACE_SERVICE_TOKEN}}" -d "{\"workspaceId\": \"WORKSPACE_ID\", \"name\": \"CALENDAR_NAME\"}"
```

### Create an Event

```bash
curl -s -X POST "http://localhost:8081/calendars/CALENDAR_ID/events" -H "Content-Type: application/json" -H "Authorization: Bearer {{WORKSPACE_SERVICE_TOKEN}}" -d "{\"title\": \"EVENT_TITLE\", \"description\": \"DESCRIPTION\", \"startTs\": \"2026-03-01T09:00:00Z\", \"endTs\": \"2026-03-01T10:00:00Z\"}"
```

### List Events (with date range filter)

```bash
curl -s -X GET "http://localhost:8081/calendars/CALENDAR_ID/events?from=2026-03-01T00:00:00Z&to=2026-03-31T23:59:59Z" -H "Authorization: Bearer {{WORKSPACE_SERVICE_TOKEN}}"
```

---

## Files

### List Files in a Workspace

```bash
curl -s -X GET "http://localhost:8081/files?workspaceId=WORKSPACE_ID" -H "Authorization: Bearer {{WORKSPACE_SERVICE_TOKEN}}"
```

### Upload a File

```bash
curl -s -X POST "http://localhost:8081/files?workspaceId=WORKSPACE_ID" -H "Authorization: Bearer {{WORKSPACE_SERVICE_TOKEN}}" -F "file=@/path/to/file.pdf"
```

### Download a File

```bash
curl -s -X GET "http://localhost:8081/files/FILE_ID/download" -H "Authorization: Bearer {{WORKSPACE_SERVICE_TOKEN}}" -o output_filename
```

### Extract Text from a PDF File

```bash
curl -s -X GET "http://localhost:8081/files/FILE_ID/text" -H "Authorization: Bearer {{WORKSPACE_SERVICE_TOKEN}}"
```

Returns: `{"id": "uuid", "filename": "doc.pdf", "pages": 5, "text": "extracted plain text..."}`

Use this to read the contents of uploaded PDF files. Only PDF files are supported.
