-- Migracja 42: kategoria/typ tkaniny (grupowanie w pickerze wariantów).
-- Nullable — istniejące tkaniny trafiają do grupy "Bez kategorii" do czasu ustawienia.
alter table fabrics
  add column if not exists category text;
