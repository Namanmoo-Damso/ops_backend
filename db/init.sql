-- =============================================================================
-- OPS Backend Database Schema
-- Version: 2.0.0 (보호자/어르신 시스템 확장)
-- =============================================================================

create extension if not exists pgcrypto;

-- =============================================================================
-- 1. USERS (사용자) - 확장됨
-- =============================================================================
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  identity text unique not null,
  display_name text,
  user_type text,  -- 'guardian' | 'ward' | null (관제센터 등)
  email text unique,
  nickname text,
  profile_image_url text,
  kakao_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_users_email on users(email);
create index if not exists idx_users_kakao_id on users(kakao_id);
create index if not exists idx_users_user_type on users(user_type);

-- =============================================================================
-- 2. DEVICES (디바이스)
-- =============================================================================
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

-- =============================================================================
-- 3. ORGANIZATIONS (기관)
-- =============================================================================
create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

-- =============================================================================
-- 4. GUARDIANS (보호자 추가 정보)
-- =============================================================================
create table if not exists guardians (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references users(id) on delete cascade,
  ward_email text not null,
  ward_phone_number text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_guardians_user_id on guardians(user_id);
create index if not exists idx_guardians_ward_email on guardians(ward_email);

-- =============================================================================
-- 5. WARDS (어르신/피보호자 추가 정보)
-- =============================================================================
create table if not exists wards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references users(id) on delete cascade,
  phone_number text not null,
  guardian_id uuid references guardians(id) on delete set null,
  organization_id uuid references organizations(id) on delete set null,
  ai_persona text default '다미',
  weekly_call_count int default 3,
  call_duration_minutes int default 15,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- 보호자 또는 기관 중 하나만 연결 (또는 둘 다 없음)
  constraint chk_ward_link check (
    (guardian_id is not null and organization_id is null) or
    (guardian_id is null and organization_id is not null) or
    (guardian_id is null and organization_id is null)
  )
);

create index if not exists idx_wards_user_id on wards(user_id);
create index if not exists idx_wards_guardian_id on wards(guardian_id);
create index if not exists idx_wards_organization_id on wards(organization_id);

-- =============================================================================
-- 6. ROOMS (통화방)
-- =============================================================================
create table if not exists rooms (
  id uuid primary key default gen_random_uuid(),
  room_name text unique not null,
  meta jsonb,
  created_at timestamptz not null default now()
);

-- =============================================================================
-- 7. CALLS (통화 기록)
-- =============================================================================
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

-- =============================================================================
-- 8. ROOM_MEMBERS (방 참여자)
-- =============================================================================
create table if not exists room_members (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references rooms(id) on delete cascade,
  user_id uuid references users(id) on delete cascade,
  role text not null default 'viewer',
  joined_at timestamptz not null default now()
);

create index if not exists idx_room_members_room_id on room_members(room_id);
create unique index if not exists uq_room_members_room_user on room_members(room_id, user_id);

-- =============================================================================
-- 9. CALL_SUMMARIES (통화 요약/분석)
-- =============================================================================
create table if not exists call_summaries (
  id uuid primary key default gen_random_uuid(),
  call_id uuid references calls(call_id) on delete cascade,
  ward_id uuid references wards(id) on delete cascade,
  summary text,
  mood text,  -- 'positive' | 'neutral' | 'negative'
  mood_score decimal(3,2),  -- 0.00 ~ 1.00
  tags text[],  -- ['날씨', '손주', '건강']
  health_keywords jsonb,  -- {"pain": 2, "sleep": "good"}
  created_at timestamptz not null default now()
);

create index if not exists idx_call_summaries_call_id on call_summaries(call_id);
create index if not exists idx_call_summaries_ward_id on call_summaries(ward_id);
create index if not exists idx_call_summaries_created_at on call_summaries(created_at);

-- =============================================================================
-- 10. HEALTH_ALERTS (건강 알림)
-- =============================================================================
create table if not exists health_alerts (
  id uuid primary key default gen_random_uuid(),
  ward_id uuid references wards(id) on delete cascade,
  guardian_id uuid references guardians(id) on delete cascade,
  alert_type text not null,  -- 'warning' | 'info'
  message text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_health_alerts_guardian_id on health_alerts(guardian_id);
create index if not exists idx_health_alerts_ward_id on health_alerts(ward_id);
create index if not exists idx_health_alerts_is_read on health_alerts(is_read);

-- =============================================================================
-- 11. NOTIFICATION_SETTINGS (알림 설정)
-- =============================================================================
create table if not exists notification_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references users(id) on delete cascade,
  call_reminder boolean not null default true,
  call_complete boolean not null default true,
  health_alert boolean not null default true,
  updated_at timestamptz not null default now()
);

create index if not exists idx_notification_settings_user_id on notification_settings(user_id);

-- =============================================================================
-- 12. REFRESH_TOKENS (리프레시 토큰)
-- =============================================================================
create table if not exists refresh_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  token_hash text unique not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_refresh_tokens_user_id on refresh_tokens(user_id);
create index if not exists idx_refresh_tokens_expires_at on refresh_tokens(expires_at);
create index if not exists idx_refresh_tokens_token_hash on refresh_tokens(token_hash);

-- =============================================================================
-- 13. GUARDIAN_WARD_REGISTRATIONS (보호자-피보호자 추가 등록)
-- =============================================================================
-- 보호자가 추가로 등록한 피보호자 정보 (다중 피보호자 지원)
-- 1차 등록은 guardians.ward_email/ward_phone_number 사용
create table if not exists guardian_ward_registrations (
  id uuid primary key default gen_random_uuid(),
  guardian_id uuid references guardians(id) on delete cascade,
  ward_email text not null,
  ward_phone_number text not null,
  linked_ward_id uuid references wards(id) on delete set null,  -- 실제 매칭 시 연결
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_gwr_guardian_id on guardian_ward_registrations(guardian_id);
create index if not exists idx_gwr_ward_email on guardian_ward_registrations(ward_email);
create index if not exists idx_gwr_linked_ward_id on guardian_ward_registrations(linked_ward_id);

-- =============================================================================
-- 14. CALL_SCHEDULES (예약 통화)
-- =============================================================================
-- 어르신별 정기 통화 스케줄
create table if not exists call_schedules (
  id uuid primary key default gen_random_uuid(),
  ward_id uuid references wards(id) on delete cascade,
  day_of_week int not null,  -- 0=일, 1=월, ..., 6=토
  scheduled_time time not null,  -- 예: '10:00:00'
  is_active boolean not null default true,
  last_called_at timestamptz,
  reminder_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_call_schedules_ward_id on call_schedules(ward_id);
create index if not exists idx_call_schedules_day_of_week on call_schedules(day_of_week);
create index if not exists idx_call_schedules_is_active on call_schedules(is_active);

-- =============================================================================
-- 15. ORGANIZATION_WARDS (기관 등록 피보호자)
-- =============================================================================
-- 기관이 CSV로 일괄 등록한 피보호자 정보
create table if not exists organization_wards (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade,
  email text not null,
  phone_number text not null,
  name text not null,
  birth_date date,
  address text,
  is_registered boolean not null default false,  -- 앱 가입 완료 여부
  ward_id uuid references wards(id) on delete set null,  -- 가입 후 연결
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (organization_id, email)
);

create index if not exists idx_org_wards_org_id on organization_wards(organization_id);
create index if not exists idx_org_wards_email on organization_wards(email);
create index if not exists idx_org_wards_is_registered on organization_wards(is_registered);
