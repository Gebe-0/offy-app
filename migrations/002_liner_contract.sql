-- OFFY — schema alinhado ao contrato do cliente Liner.
-- Roda na URL DIRETA do Neon (sem pooler).

drop table if exists playback_events cascade;
drop table if exists playlist_items cascade;
drop table if exists playlists cascade;
drop table if exists collections cascade;
drop table if exists likes cascade;
drop table if exists follows cascade;
drop table if exists lyrics_cache cascade;
drop table if exists refresh_tokens cascade;
drop table if exists tracks cascade;
drop table if exists devices cascade;
drop table if exists users cascade;
drop table if exists lyrics cascade;

create table users (
  id                      uuid primary key default gen_random_uuid(),
  email                   text not null unique,
  password_hash           text not null,
  username                text not null unique,
  display_name            text,
  avatar_url              text,
  bio                     text,
  is_public               boolean not null default true,
  show_activity           boolean not null default true,
  show_history            boolean not null default true,
  show_liked_tracks       boolean not null default true,
  participate_leaderboards boolean not null default true,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
create index users_username_idx on users (lower(username));

create table refresh_tokens (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users(id) on delete cascade,
  token_hash   text not null unique,
  expires_at   timestamptz not null,
  created_at   timestamptz not null default now(),
  revoked_at   timestamptz
);
create index refresh_tokens_user_idx on refresh_tokens(user_id);

create table tracks (
  id           text primary key,
  title        text not null,
  artists      jsonb not null default '[]'::jsonb,
  album        jsonb,
  duration_ms  integer not null default 0,
  cover        jsonb,
  explicit     boolean not null default false,
  payload      jsonb not null default '{}'::jsonb,
  refreshed_at timestamptz not null default now()
);
create index tracks_refreshed_idx on tracks (refreshed_at);

create table likes (
  user_id  uuid not null references users(id) on delete cascade,
  track_id text not null references tracks(id) on delete cascade,
  liked_at timestamptz not null default now(),
  primary key (user_id, track_id)
);
create index likes_user_time_idx on likes (user_id, liked_at desc, track_id desc);

create table collections (
  user_id    uuid not null references users(id) on delete cascade,
  kind       text not null check (kind in ('albums', 'artists', 'playlists')),
  item_id    text not null,
  snapshot   jsonb not null default '{}'::jsonb,
  saved_at   timestamptz not null default now(),
  primary key (user_id, kind, item_id)
);

create table follows (
  follower_id uuid not null references users(id) on delete cascade,
  followee_id uuid not null references users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (follower_id, followee_id)
);
create index follows_followee_idx on follows (followee_id);

create table playlists (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references users(id) on delete cascade,
  title       text not null,
  description text not null default '',
  is_public   boolean not null default false,
  revision    integer not null default 1,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index playlists_owner_idx on playlists (owner_id, created_at desc);

create table playlist_items (
  id          uuid primary key default gen_random_uuid(),
  playlist_id uuid not null references playlists(id) on delete cascade,
  track_id    text not null references tracks(id),
  position    integer not null,
  added_at    timestamptz not null default now()
);
create index playlist_items_order_idx on playlist_items (playlist_id, position);

create table playback_events (
  id                  bigserial primary key,
  user_id             uuid not null references users(id) on delete cascade,
  track_id            text not null references tracks(id) on delete cascade,
  playback_session_id text not null default '',
  listening_session_id text not null default '',
  played_duration_ms  integer not null default 0,
  track_duration_ms   integer not null default 0,
  completion_rate     real not null default 0,
  completed           boolean not null default false,
  skipped             boolean not null default false,
  loop_count          integer not null default 0,
  has_seek_backward   boolean not null default false,
  context             jsonb,
  created_at          timestamptz not null default now()
);
create index playback_events_user_idx on playback_events (user_id, created_at desc, id desc);
create index playback_events_track_idx on playback_events (track_id, created_at desc);
create index playback_events_time_idx on playback_events (created_at desc);

create table lyrics_cache (
  track_id   text primary key,
  provider   text not null,
  sync_level text not null,
  payload    jsonb not null,
  checked_at timestamptz not null default now()
);
