create table if not exists public.replaylab_rooms (
  id text primary key check (id ~ '^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$'),
  read_capability_hash text not null check (read_capability_hash ~ '^[0-9a-f]{64}$'),
  write_capability_hash text not null check (write_capability_hash ~ '^[0-9a-f]{64}$'),
  snapshot_base64 text,
  snapshot_sha256 text check (snapshot_sha256 is null or snapshot_sha256 ~ '^[0-9a-f]{64}$'),
  updated_at timestamptz not null default now(),
  check ((snapshot_base64 is null) = (snapshot_sha256 is null))
);

alter table public.replaylab_rooms enable row level security;
revoke all on table public.replaylab_rooms from public, anon, authenticated, service_role;
grant select, update on table public.replaylab_rooms to service_role;

comment on table public.replaylab_rooms is 'Private ReplayLab capability hashes and durable Yjs network-shadow snapshots.';
