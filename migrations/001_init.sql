create extension if not exists pgcrypto;

create table if not exists workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_ref text not null,
  role text not null check (role in ('owner','admin','editor','viewer')),
  created_at timestamptz not null default now(),
  unique(workspace_id, user_ref)
);

create table if not exists docs_pages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  title text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists docs_blocks (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references docs_pages(id) on delete cascade,
  type text not null,
  data jsonb not null default '{}'::jsonb,
  order_index int not null default 0
);

create table if not exists tables (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists table_columns (
  id uuid primary key default gen_random_uuid(),
  table_id uuid not null references tables(id) on delete cascade,
  name text not null,
  type text not null,
  order_index int not null default 0
);

create table if not exists table_rows (
  id uuid primary key default gen_random_uuid(),
  table_id uuid not null references tables(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists table_cells (
  row_id uuid not null references table_rows(id) on delete cascade,
  column_id uuid not null references table_columns(id) on delete cascade,
  value jsonb not null default '{}'::jsonb,
  primary key (row_id, column_id)
);

create table if not exists calendars (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null
);

create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  calendar_id uuid not null references calendars(id) on delete cascade,
  title text not null,
  description text,
  start_ts timestamptz not null,
  end_ts timestamptz not null
);

create table if not exists files (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  filename text not null,
  content_type text,
  size_bytes bigint not null,
  storage_path text not null,
  created_at timestamptz not null default now()
);
