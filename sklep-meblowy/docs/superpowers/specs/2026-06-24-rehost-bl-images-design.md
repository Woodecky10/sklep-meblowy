# Projekt: przehostowanie obrazów z CDN BaseLinkera do własnego storage

**Data:** 2026-06-24
**Status:** zaakceptowany (Mikołaj). Spec do przeglądu przed planem.
**Powiązane:** wycięcie BaseLinkera ([[baselinker-removal-2026-06-17]], PR#43) — to ostatni żywy ślad BL (obrazy na CDN BL); konto BL będzie zamknięte.

---

## 1. Kontekst / problem

Po wycięciu BL **15 produktów** (łóżka/narożniki: VEGAS, SANTOS, FADO, LUNA, BRUNO, Marbella, Tiki…) wciąż ma URL-e obrazów na `*.cdn.baselinker.com` — w `products.images[]` i/lub w `products.variants.combinations[].images[]`. Wykryte SQL-em: `images::text ilike '%cdn.baselinker.com%' or variants::text ilike '%cdn.baselinker.com%'`.

**Konto BaseLinker będzie zamknięte** → CDN BL przestanie serwować te obrazy → te produkty będą miały puste/zepsute zdjęcia. Dlatego obrazy trzeba przenieść do własnego storage (Supabase bucket `products`) **PÓKI CDN BL jeszcze działa**, podmienić URL-e w bazie, a potem usunąć hosty BL z `next.config.ts`.

## 2. Decyzja (podejście A)

Jednorazowy skrypt migracyjny `scripts/rehost-bl-images.ts` (TypeScript, uruchamiany `tsx`), z trybem **dry-run (domyślny)** i **--live**. Idempotentny — rusza wyłącznie URL-e zawierające `cdn.baselinker.com`. Po migracji: usunięcie hostów BL z `next.config.ts`.

**Stan obecny (z kodu):**
- `Product.images: string[]`; `ProductVariant.images?: string[]` (w `variants.combinations[]`).
- Upload: bucket `products` (public), ścieżka `${Date.now()}-${randomUUID()}.${ext}`, przez `supabase.storage.from("products").upload(...)`, publiczny URL z `getPublicUrl`. Wzorzec w `app/admin/produkty/actions.ts`.
- Service-role key dostępny w `.env.local` (`SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`).

## 3. Architektura skryptu

`scripts/rehost-bl-images.ts` (samodzielny, poza Next; `@supabase/supabase-js` + globalny `fetch` z Node 18+):

1. **Klient admin:** `createClient(SUPABASE_URL, SERVICE_ROLE_KEY)` z env (`.env.local` ładowane przez `tsx --env-file=.env.local` lub `dotenv`).
2. **Pobierz kandydatów:** `select id, name, images, variants from products` i przefiltruj w kodzie te, które mają URL z `cdn.baselinker.com` w `images` lub w `variants.combinations[].images`.
3. **Per produkt:**
   - Zbierz unikalne BL-CDN URL-e (z `images` + wszystkich wariantów).
   - Dla każdego: `fetch(url)` → bufor + `content-type` → wyznacz `ext` (jpg/png/webp z mime) → `path = ${Date.now()}-${randomUUID()}.${ext}` → `storage.from("products").upload(path, buffer, { contentType, upsert:false })` → `getPublicUrl` → wpis do mapy `stary→nowy`.
   - Podmień URL-e w strukturze `images[]` i w każdej `variants.combinations[].images[]` wg mapy (tylko zmienione URL-e; reszta — np. Unsplash — bez zmian).
   - `update products set images=…, variants=… where id=…` (per produkt, atomowo dla tego wiersza).
4. **Tryby:**
   - `--dry-run` (domyślnie): NIE uploaduje, NIE pisze do DB — tylko wypisuje, ile produktów, ile URL-i BL, mapę „co→gdzie" (planowane). Tylko odczyt.
   - `--live`: wykonuje upload + update.
5. **Idempotencja:** rusza wyłącznie URL-e z `cdn.baselinker.com`; ponowne uruchomienie po sukcesie nie znajdzie już nic (URL-e są już własne). Bezpieczny re-run.

## 4. Obsługa błędów / bezpieczeństwo

- **Per-produkt, fail-safe:** błąd fetchu/uploadu dla danego URL-a → pomiń CAŁY ten produkt (NIE zapisuj częściowej podmiany, żeby nie zostawić wiersza z mieszanką starych/nowych URL-i), zaloguj produkt+URL do listy „nieudane". Reszta produktów leci dalej.
- **Brak nadpisania innych hostów:** podmieniamy tylko URL-e `cdn.baselinker.com`; Unsplash/inne zostają.
- **Dry-run pierwszy:** zawsze najpierw dry-run (tylko odczyt), przegląd wyniku, dopiero potem `--live` za wyraźną zgodą.
- **Produkcyjne dane:** skrypt mutuje produkcyjne `products`. Run-flow: Claude robi dry-run i pokazuje wynik; live odpala właściciel albo Claude za wyraźnym OK.

## 5. Po migracji

- Re-run SQL kontrolny: `select count(*) from products where images::text ilike '%cdn.baselinker.com%' or variants::text ilike '%cdn.baselinker.com%'` → **0**.
- `next.config.ts`: usunąć wpisy `upload.cdn.baselinker.com` + `*.cdn.baselinker.com` z `remotePatterns` oraz komentarz. `npm run build` musi przejść.
- Skrypt `scripts/rehost-bl-images.ts` — zostaje w repo jako ślad migracji (albo usunąć po użyciu — do decyzji w planie; domyślnie zostaje, nieszkodliwy).

## 6. Poza zakresem

- Obrazy z innych zewnętrznych hostów (Unsplash itp.) — nie ruszamy.
- Kompresja/optymalizacja przenoszonych obrazów — przenosimy 1:1 (oryginał). (Ewentualna kompresja = osobny temat.)
- Zmiana mechanizmu uploadu w adminie — bez zmian.

## 7. Testy / weryfikacja

- Skrypt: brak testów jednostkowych (jednorazowa migracja); weryfikacja = **dry-run** (przegląd planu) + kontrolny SQL po `--live` (0 wierszy) + ręczny spot-check, że obrazy ładują się na kartach tych produktów.
- `next.config.ts`: `npm run build` przechodzi po usunięciu hostów.
- `tsc`/`lint` skryptu — skrypt poza `app/`; upewnić się, że nie psuje bramek projektu (ewent. wykluczyć `scripts/` z lintu/tsc jeśli trzeba — do sprawdzenia w planie).

## 8. Branch / proces

- Gałąź `chore/rehost-bl-images` z `main`.
- Plan TDD → wykonanie (dry-run → live → next.config) → PR (konto Woodecky10, za zgodą).
- **Pilność:** wykonać przed zamknięciem konta BL (inaczej CDN BL padnie i nie ma skąd pobrać obrazów).

---

**Następny krok:** przegląd speca → `writing-plans` → wykonanie.
