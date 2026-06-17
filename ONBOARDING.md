# Mollien — onboarding / kontynuacja projektu

Przewodnik do podjęcia pracy nad projektem na nowym komputerze / w nowej sesji.

## Co to jest
Sklep meblowy **Mollien** (meble na zamówienie). **Next.js 16** (App Router, Server Actions, Turbopack) + **Supabase** (Postgres + Auth + Storage) + **Stripe**. Aplikacja jest w podfolderze `sklep-meblowy/`. Repo: `Woodecky10/sklep-meblowy`, główny branch `main`. Produkcja: Vercel (build z `origin/main`), domena www.mollien.pl.

> ⚠️ To NIE jest Next.js z treningu — wersja 16 ma breaking changes. Przed kodem Server Component/Action sprawdź `node_modules/next/dist/docs/`. `params`/`searchParams` to Promise. (Patrz `sklep-meblowy/AGENTS.md`.)

## Duży kierunek: rezygnacja z BaseLinkera
Decyzja właścicielki (2026-06-17): sklep przejmuje funkcje BaseLinkera natywnie. Rozbite na **4 podprojekty** (każdy: spec → plan → wdrożenie):

1. ✅ **Panel zarządzania zamówieniami + wygaszenie pushu BL** — ZROBIONE, na `main`.
2. ✅ **Natywne tworzenie produktów + wygaszenie syncu BL** — ZROBIONE, na `main`.
3. ⬜ **Faktury / VAT** — TODO. Wymaga rozpoznania obecnego obiegu fakturowania (czy na zamówieniach jest NIP/dane firmy, kto dziś wystawia faktury, czy sklep ma generować PDF+numerację czy tylko zbierać dane dla zewn. programu).
4. ⬜ **Wysyłka — integracja API kuriera** — TODO. Wymaga wyboru przewoźników (InPost/DPD/DHL/GLS?) — dziś dostawa „mieszana", w panelu zamówień jest tylko ręczne pole przewoźnik+nr śledzenia.

Kod i kolumny BaseLinkera zostają jako **legacy** — nie usuwać przedwcześnie (zamówienia w locie mają `baselinker_*`). Pełny cleanup = osobne, późniejsze zadanie. Dawne audyty BL (`docs/audyt-baselinker-*`, `docs/bl-*`) są już nieaktualne kierunkowo.

## Stan repo
- `origin/main` = commit `3e93d2e` (podprojekty 1+2 wypchnięte 2026-06-17).
- **Specy:** `sklep-meblowy/docs/superpowers/specs/2026-06-17-panel-zamowien-admin-design.md`, `...-produkty-natywne-design.md`
- **Plany (TDD):** `sklep-meblowy/docs/superpowers/plans/2026-06-17-panel-zamowien-admin.md`, `...-produkty-natywne.md`
- Pełny kontekst każdego podprojektu jest w tych plikach — przeczytaj przed kontynuacją.

## Setup na nowym kompie
```bash
git clone https://github.com/Woodecky10/sklep-meblowy.git
cd sklep-meblowy/sklep-meblowy        # appka jest w podfolderze (package.json tutaj)
npm install
# utwórz .env.local na bazie .env.example (poniżej); sekrety z panelu Vercel albo starego kompa
npm run dev
```
Niezbędne env do dev (nazwy — wartości z Vercel/starego `.env.local`):
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_APP_URL`.
Zmienne `BASELINKER_*`, `BL_STATUS_*`, `CRON_SECRET` — już praktycznie zbędne (BL wygaszony). Pełny szablon: `sklep-meblowy/.env.example`.

## Baza — migracje do uruchomienia (Supabase SQL Editor; wspólna baza, więc RAZ z dowolnego miejsca)
- `sklep-meblowy/supabase/migrations/29_*.sql` + `30_*.sql` — i18n DE (jeśli jeszcze nie odpalone).
- `sklep-meblowy/supabase/migrations/31_orders_admin_fields.sql` — pola panelu zamówień. **BEZ niej `/admin/zamowienia` nie działa w runtime.**
Podprojekt 2 (produkty) migracji nie wymaga (kolumny były już od migr. 29).
> Claude/agent NIE ma dostępu DDL — migracje uruchamia człowiek w Supabase SQL Editorze (przez przeglądarkę).

## Bramki jakości (uruchamiać z `sklep-meblowy/`)
`npx tsc --noEmit` (0 błędów) · `npm run lint` (0) · `npm test` (vitest, zielony) · `npm run build` (przechodzi). Stan na 3e93d2e: 187 testów, 48 tras.

## Push do origin
Origin wymaga konta **Woodecky10** — `mwlo1403` NIE ma write (push → 403). Na nowym kompie: `gh auth login` jako Woodecky10, albo procedura przełączenia konta + helper gh (jak w starych notatkach). Każdy push do `main` — za wyraźną zgodą właściciela.

## Metoda pracy (tak prowadzone są podprojekty)
brainstorming → spec (`docs/superpowers/specs/`) → plan TDD (`docs/superpowers/plans/`) → implementacja subagent-driven (świeży subagent na task + recenzja po każdym + final whole-branch review) → merge. Panel admina jest **PL-only** (bez i18n). Server actions: `"use server"` + `requireAdmin()` + `createAdminClient()` + `revalidatePath`, zwracają `ActionResult`, updaty castowane `as never`. Komponenty klienckie używają `app/admin/_shared` (`Card`/`Field`/`ToastView`/`inputCls`) + `useTransition`.

## Następny krok
**Podprojekt 3 (faktury)** — zacznij od rozpoznania obiegu fakturowania (pytania wyżej), potem spec → plan → wdrożenie. Albo **podprojekt 4 (wysyłka)** po wyborze przewoźników.

## Drobne follow-upy (nieblokujące, do cleanupu BL)
- `schema.sql` jest niekompletnym baseline'em (pre-existing) — fresh-DB bootstrap z samego pliku byłby niepełny; źródłem prawdy są migracje.
- Martwy `syncProductsAction` + nieaktualny komentarz BL w `app/konto/zamowienia/actions.ts` — do sprzątnięcia przy pełnym usuwaniu BL.
