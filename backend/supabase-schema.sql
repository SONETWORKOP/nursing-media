-- Nursing Media — Supabase (Postgres) schema
-- Supabase Dashboard → SQL Editor me paste karke RUN dabao (ek baar).
-- Backend service_role key use karta hai, isliye RLS policy ki zarurat nahi.

create table if not exists users (
  id bigint generated always as identity primary key,
  name text not null,
  phone text unique not null,
  password_hash text not null,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists subjects (
  sem integer not null,
  sub_id text not null,
  name text not null,
  icon text not null default '',
  primary key (sem, sub_id)
);

create table if not exists topics (
  sem integer not null,
  sub_id text not null,
  topic_id integer not null,
  title text not null,
  content text not null default '',
  pdf text not null default '',
  video text not null default '',
  primary key (sem, sub_id, topic_id)
);

create table if not exists settings (
  key text primary key,
  value text not null default ''
);

-- Paid section: admin-created ID/password, revoke via is_active=false ya delete
create table if not exists paid_users (
  id bigint generated always as identity primary key,
  login_id text unique not null,
  name text not null default '',
  password_hash text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists paid_topics (
  id bigint generated always as identity primary key,
  title text not null,
  content text not null default '',
  pdf text not null default '',
  video text not null default '',
  created_at timestamptz not null default now()
);
