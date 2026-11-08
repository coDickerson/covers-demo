-- Covers live-service schema. Every row is scoped to a visitor session (per-visitor sandbox).

create table if not exists sessions (
  id          text primary key,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '24 hours'
);

-- Session data as JSON documents keyed by kind ('plan', 'receipt', 'hcp', 'ledger', ...).
-- Validated with the contract's Zod schemas in TypeScript, so additive contract changes need no migration.
create table if not exists docs (
  session_id  text not null references sessions(id) on delete cascade,
  kind        text not null,
  id          text not null,
  data        jsonb not null,
  updated_at  timestamptz not null default now(),
  primary key (session_id, kind, id)
);

-- Append-only audit log. Not cascaded from sessions: reset keeps the history.
create table if not exists audit_events (
  seq             bigserial primary key,
  id              text not null unique,
  session_id      text not null,
  at              timestamptz not null default now(),
  actor_id        text not null,
  action          text not null,
  plan_id         text,
  input_hash      text not null,
  model           text,
  prompt_version  text,
  pack_id         text,
  rule_id         text,
  detail          text not null
);
create index if not exists audit_events_session on audit_events (session_id, seq);

-- UPDATE is never allowed. DELETE only inside purge_expired_sessions(), which sets a transaction-local flag.
create or replace function audit_events_append_only() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' and current_setting('covers.allow_purge', true) = 'on' then
    return old;
  end if;
  raise exception 'audit_events is append-only (% refused)', tg_op using errcode = 'insufficient_privilege';
end $$;

drop trigger if exists audit_events_no_change on audit_events;
create trigger audit_events_no_change before update or delete on audit_events
  for each row execute function audit_events_append_only();

-- Expired sessions (24h) are removed with their documents and audit rows.
create or replace function purge_expired_sessions() returns integer language plpgsql as $$
declare n integer;
begin
  perform set_config('covers.allow_purge', 'on', true);
  delete from audit_events where session_id in (select id from sessions where expires_at < now());
  delete from sessions where expires_at < now();
  get diagnostics n = row_count;
  perform set_config('covers.allow_purge', 'off', true);
  return n;
end $$;
