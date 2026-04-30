-- ============================================================
-- Migracja 11: log synchronizacji produktów BaseLinker → Supabase
-- ============================================================
-- Tabela `baselinker_sync_log` przechowuje historię uruchomień sync.
-- Każdy zapis zawiera kto wywołał (user_id), kiedy, jak długo trwało
-- i pełen wynik (per-inventory: inserted/updated/skipped + lista pominiętych
-- z powodami).
--
-- Używane przez admin panel `/admin/baselinker`:
--   - tabela ostatnich N synchronizacji (kiedy + ile rekordów)
--   - rozwijana lista pominiętych produktów z reasons (kategoria nie zmapowana,
--     brak ceny, brak nazwy itp.)
-- ============================================================

create table if not exists public.baselinker_sync_log (
  id              uuid primary key default uuid_generate_v4(),
  triggered_by    uuid references auth.users(id) on delete set null,
  triggered_at    timestamptz not null default now(),
  duration_ms     integer,
  status          text not null check (status in ('success', 'partial', 'error')),
  total_in_bl     integer not null default 0,
  inserted        integer not null default 0,
  updated         integer not null default 0,
  skipped_count   integer not null default 0,
  results         jsonb,    -- per-inventory wynik (lista SyncResult)
  error_message   text      -- gdy status = 'error'
);

create index if not exists idx_bl_sync_log_triggered_at
  on public.baselinker_sync_log (triggered_at desc);

-- ============================================================
-- RLS — tylko admin czyta i zapisuje
-- ============================================================
alter table public.baselinker_sync_log enable row level security;

create policy "baselinker_sync_log: admin read"
  on public.baselinker_sync_log for select
  to authenticated
  using (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin');

create policy "baselinker_sync_log: admin write"
  on public.baselinker_sync_log for all
  to authenticated
  using (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin')
  with check (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin');
