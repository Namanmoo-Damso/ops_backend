create extension if not exists pgcrypto;

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  identity text unique not null,
  display_name text,
  created_at timestamptz not null default now()
);

create table if not exists devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  platform text not null,
  apns_token text,
  voip_token text,
  supports_callkit boolean not null default true,
  env text not null default 'prod',
  last_seen timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (apns_token),
  unique (voip_token)
);

create index if not exists idx_devices_user_id on devices(user_id);
create index if not exists idx_devices_env on devices(env);

create table if not exists rooms (
  id uuid primary key default gen_random_uuid(),
  room_name text unique not null,
  meta jsonb,
  created_at timestamptz not null default now()
);

create table if not exists calls (
  call_id uuid primary key default gen_random_uuid(),
  caller_user_id uuid references users(id) on delete set null,
  callee_user_id uuid references users(id) on delete set null,
  caller_identity text not null,
  callee_identity text not null,
  room_name text not null,
  state text not null default 'ringing',
  created_at timestamptz not null default now(),
  answered_at timestamptz,
  ended_at timestamptz
);

create index if not exists idx_calls_callee_state on calls(callee_identity, state);
create index if not exists idx_calls_room_name on calls(room_name);

create table if not exists room_members (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references rooms(id) on delete cascade,
  user_id uuid references users(id) on delete cascade,
  role text not null default 'viewer',
  joined_at timestamptz not null default now()
);

create index if not exists idx_room_members_room_id on room_members(room_id);
create unique index if not exists uq_room_members_room_user on room_members(room_id, user_id);
