-- Presença: quem está ouvindo o quê agora.
create table if not exists presence (
  user_id     uuid primary key references users(id) on delete cascade,
  track_id    text references tracks(id) on delete cascade,
  position_ms integer not null default 0,
  updated_at  timestamptz not null default now()
);
create index if not exists presence_updated_idx on presence (updated_at desc);
