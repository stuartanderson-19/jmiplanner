-- Run this in your Supabase SQL editor to set up the schema

create extension if not exists "uuid-ossp";

-- Meetings table (one row per Granola meeting)
create table if not exists meetings (
  id uuid primary key default uuid_generate_v4(),
  granola_id text unique not null,
  title text not null,
  meeting_date timestamptz not null,
  participants text[] default '{}',
  summary text default '',
  created_at timestamptz default now()
);

-- Actions table (extracted action items)
create table if not exists actions (
  id uuid primary key default uuid_generate_v4(),
  meeting_id uuid references meetings(id) on delete cascade,
  text text not null,
  owner text default '',
  priority text check (priority in ('high', 'medium', 'low')) default 'medium',
  done boolean default false,
  done_at timestamptz,
  created_at timestamptz default now()
);

-- Reminders table
create table if not exists reminders (
  id uuid primary key default uuid_generate_v4(),
  action_id uuid references actions(id) on delete cascade,
  remind_at timestamptz not null,
  message text not null,
  sent boolean default false,
  sent_at timestamptz,
  created_at timestamptz default now()
);

-- Sync log table
create table if not exists sync_logs (
  id uuid primary key default uuid_generate_v4(),
  ran_at timestamptz default now(),
  success boolean,
  new_meetings int default 0,
  new_actions int default 0,
  logs text[] default '{}'
);

-- Indexes
create index if not exists actions_meeting_id on actions(meeting_id);
create index if not exists actions_done on actions(done);
create index if not exists actions_priority on actions(priority);
create index if not exists reminders_remind_at on reminders(remind_at) where sent = false;
create index if not exists meetings_date on meetings(meeting_date desc);

-- Enable RLS (Row Level Security) - open for now, lock down per user if needed
alter table meetings enable row level security;
alter table actions enable row level security;
alter table reminders enable row level security;
alter table sync_logs enable row level security;

-- Allow all operations from service role (used by API routes)
create policy "service role full access - meetings" on meetings for all using (true);
create policy "service role full access - actions" on actions for all using (true);
create policy "service role full access - reminders" on reminders for all using (true);
create policy "service role full access - sync_logs" on sync_logs for all using (true);
