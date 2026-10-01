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
