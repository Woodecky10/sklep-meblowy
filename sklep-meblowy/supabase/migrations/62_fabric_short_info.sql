-- Migracja 62: krotkie info o tkaninie (dymek obok "szczegoly" w pickerze).
-- Nullable text; osobne od description (rich text na /tkaniny). PL + DE.
alter table fabrics
  add column if not exists short_info text,
  add column if not exists short_info_de text;
