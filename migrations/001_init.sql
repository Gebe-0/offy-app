-- OFFY platform — schema inicial
-- roda na URL DIRETA do Neon (sem pooler)

create table if not exists users (
  id           uuid primary key default gen_random_uuid(),
  handle       text unique not null,
  display_name text not null,
  created_at   timestamptz not null default now()
);

create table if not exists devices (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users(id) on delete cascade,
  secret_hash  text not null,
  label        text,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index if not exists devices_user_idx on devices(user_id);

create table if not exists tracks (
  id           text primary key,
  source       text not null check (source in ('youtube', 'soundcloud')),
  title        text not null,
  artists      text not null,
  artist_id    text,
  duration_ms  integer not null default 0,
  cover_url    text,
  album_id     text,
  payload      jsonb not null default '{}'::jsonb,
  refreshed_at timestamptz not null default now()
);
create index if not exists tracks_refreshed_idx on tracks(refreshed_at);

create table if not exists lyrics (
  track_id    text primary key references tracks(id) on delete cascade,
  provider    text not null,
  sync_level  text not null check (sync_level in ('plain', 'line_level', 'word_level', 'syllable_level')),
  format      text not null,
  content     text not null,
  quality     integer not null default 0,
  checked_at  timestamptz not null default now()
);

create table if not exists likes (
  user_id  uuid not null references users(id) on delete cascade,
  track_id text not null references tracks(id) on delete cascade,
  liked_at timestamptz not null default now(),
  primary key (user_id, track_id)
);
create index if not exists likes_user_time_idx on likes(user_id, liked_at desc, track_id desc);

create table if not exists playlists (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references users(id) on delete cascade,
  title       text not null,
  description text not null default '',
  is_public   boolean not null default false,
  revision    integer not null default 1,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists playlists_owner_idx on playlists(owner_id, created_at desc);

create table if not exists playlist_items (
  id          uuid primary key default gen_random_uuid(),
  playlist_id uuid not null references playlists(id) on delete cascade,
  track_id    text not null references tracks(id),
  position    integer not null,
  added_at    timestamptz not null default now()
);
create index if not exists playlist_items_order_idx on playlist_items(playlist_id, position);
create index if not exists playlist_items_track_idx on playlist_items(track_id);

create table if not exists playback_events (
  id          bigserial primary key,
  user_id     uuid not null references users(id) on delete cascade,
  track_id    text not null references tracks(id) on delete cascade,
  position_ms integer not null default 0,
  duration_ms integer not null default 0,
  completed   boolean not null default false,
  skipped     boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists playback_events_user_idx on playback_events(user_id, created_at desc, id desc);
create index if not exists playback_events_track_idx on playback_events(track_id, created_at desc);
