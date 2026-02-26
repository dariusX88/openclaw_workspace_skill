-- 002: Add performance indexes + full-text search support

-- Foreign key indexes (Postgres doesn't auto-index FK columns)
create index if not exists idx_members_workspace on members(workspace_id);
create index if not exists idx_docs_pages_workspace on docs_pages(workspace_id);
create index if not exists idx_docs_blocks_page on docs_blocks(page_id);
create index if not exists idx_tables_workspace on tables(workspace_id);
create index if not exists idx_table_columns_table on table_columns(table_id);
create index if not exists idx_table_rows_table on table_rows(table_id);
create index if not exists idx_table_cells_row on table_cells(row_id);
create index if not exists idx_table_cells_column on table_cells(column_id);
create index if not exists idx_calendars_workspace on calendars(workspace_id);
create index if not exists idx_events_calendar on events(calendar_id);
create index if not exists idx_files_workspace on files(workspace_id);

-- Timestamp indexes for sorting/filtering
create index if not exists idx_docs_pages_updated on docs_pages(updated_at desc nulls last);
create index if not exists idx_events_start on events(start_ts);
create index if not exists idx_files_created on files(created_at desc);

-- Full-text search: add tsvector columns + GIN indexes
alter table docs_pages add column if not exists search_tsv tsvector;
alter table docs_blocks add column if not exists search_tsv tsvector;
alter table events add column if not exists search_tsv tsvector;

create index if not exists idx_docs_pages_fts on docs_pages using gin(search_tsv);
create index if not exists idx_docs_blocks_fts on docs_blocks using gin(search_tsv);
create index if not exists idx_events_fts on events using gin(search_tsv);

-- Populate search vectors for existing data
update docs_pages set search_tsv = to_tsvector('simple', coalesce(title, ''));
update docs_blocks set search_tsv = to_tsvector('simple', coalesce(data->>'content', '') || ' ' || coalesce(data->>'code', ''));
update events set search_tsv = to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(description, ''));

-- Auto-update triggers for new/updated rows
create or replace function update_docs_pages_tsv() returns trigger as $$
begin
  new.search_tsv := to_tsvector('simple', coalesce(new.title, ''));
  return new;
end;
$$ language plpgsql;

create or replace function update_docs_blocks_tsv() returns trigger as $$
begin
  new.search_tsv := to_tsvector('simple', coalesce(new.data->>'content', '') || ' ' || coalesce(new.data->>'code', ''));
  return new;
end;
$$ language plpgsql;

create or replace function update_events_tsv() returns trigger as $$
begin
  new.search_tsv := to_tsvector('simple', coalesce(new.title, '') || ' ' || coalesce(new.description, ''));
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_docs_pages_tsv on docs_pages;
create trigger trg_docs_pages_tsv before insert or update on docs_pages for each row execute function update_docs_pages_tsv();

drop trigger if exists trg_docs_blocks_tsv on docs_blocks;
create trigger trg_docs_blocks_tsv before insert or update on docs_blocks for each row execute function update_docs_blocks_tsv();

drop trigger if exists trg_events_tsv on events;
create trigger trg_events_tsv before insert or update on events for each row execute function update_events_tsv();
