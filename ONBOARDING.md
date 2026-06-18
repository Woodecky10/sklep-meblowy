# Mollien — onboarding / kontynuacja projektu

Przewodnik do podjęcia pracy nad projektem na nowym komputerze / w nowej sesji.

## Co to jest
Sklep meblowy **Mollien** (meble na zamówienie). **Next.js 16** (App Router, Server Actions, Turbopack) + **Supabase** (Postgres + Auth + Storage) + **Stripe**. Aplikacja jest w podfolderze `sklep-meblowy/`. Repo: `Woodecky10/sklep-meblowy`, główny branch `main`. Produkcja: Vercel (build z `origin/main`), domena www.mollien.pl.

> ⚠️ To NIE jest Next.js z treningu — wersja 16 ma breaking changes. Przed kodem Server Component/Action sprawdź `node_modules/next/dist/docs/`. `params`/`searchParams` to Promise. (Patrz `sklep-meblowy/AGENTS.md`.)

## Duży kierunek: rezygnacja z BaseLinkera
Decyzja właścicielki (2026-06-17): sklep przejmuje funkcje BaseLinkera natywnie. Rozbite na **4 podprojekty** (każdy: spec → plan → wdrożenie):

1. ✅ **Panel zarządzania zamówieniami + wygaszenie pushu BL** — ZROBIONE, na `main`.
2. ✅ **Natywne tworzenie produktów + wygaszenie syncu BL** — ZROBIONE, na `main`.
3. ⬜ **Faktury / VAT — przez KSeF** — TODO, czeka na odpowiedzi właścicielki. USTALENIE 2026-06-18: faktury **MUSZĄ być w KSeF** (obowiązkowy od 1.04.2026 dla „pozostałych przedsiębiorców"; sklep meblowy NIE łapie się na wyjątek <450 zł/<10 tys. zł mies. — obowiązek najpewniej już działa). **Rekomendacja: NIE budować bezpośredniej integracji KSeF** — sklep zbiera dane → API programu fakturowego (Fakturownia/wFirma/inFakt/Comarch), który robi KSeF+FA(3)+numerację+PDF+UPO. W kodzie ZERO podstaw (brak NIP/danych firmy/VAT/podziału netto-brutto). Pytania do właścicielki + kontekst KSeF: `sklep-meblowy/docs/2026-06-18-rozpoznanie-faktury-wysylka.md`.
4. 🟡 **Wysyłka — transport firmą transportową (NIE kurier)** — pierwszy slice ZROBIONY, reszta czeka na odpowiedzi właścicielki. USTALENIE 2026-06-18: gabarytów nie wozi żadna firma kurierska → transport firmą transportową, więc **NIE budujemy integracji API kuriera**; podprojekt = ręczny moduł dostawy. ✅ Slice 1 (PR #38, scalony 2026-06-18): klient widzi przewoźnika + nr śledzenia w `/konto/zamowienia/[id]` (helper `app/_lib/delivery.ts` + karta „Dostawa" PL/DE). ⬜ Reszta: planowany termin dostawy, dane dla firmy transportowej (piętro/winda/wniesienie/telefon), model kosztu dostawy. Pytania + stan kodu: `sklep-meblowy/docs/2026-06-18-rozpoznanie-faktury-wysylka.md`.

Kod i kolumny BaseLinkera zostają jako **legacy** — nie usuwać przedwcześnie (zamówienia w locie mają `baselinker_*`). Pełny cleanup = osobne, późniejsze zadanie. Dawne audyty BL (`docs/audyt-baselinker-*`, `docs/bl-*`) są już nieaktualne kierunkowo.

## Stan repo
- `origin/main` = commit `b02ae0c` (2026-06-18: podprojekty 1+2 + pierwszy slice podprojektu 4 + dokumentacja rozpoznania faktur/wysyłki).
- **Specy:** `sklep-meblowy/docs/superpowers/specs/2026-06-17-panel-zamowien-admin-design.md`, `...-produkty-natywne-design.md`, `2026-06-18-konto-dostawa-przewoznik-design.md`
- **Plany (TDD):** `sklep-meblowy/docs/superpowers/plans/2026-06-17-panel-zamowien-admin.md`, `...-produkty-natywne.md`, `2026-06-18-konto-dostawa-przewoznik.md`
- **Rozpoznanie faktur (KSeF) + wysyłki** (pytania do właścicielki + stan kodu): `sklep-meblowy/docs/2026-06-18-rozpoznanie-faktury-wysylka.md` — **odpowiedzi właścicielki mają tam wylądować**.
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
Origin wymaga konta **Woodecky10** — `mwlo1403` NIE ma write (push → 403). Każdy push do `main` — za wyraźną zgodą właściciela.
- **Na nowym kompie (najprostsze):** `gh auth login` jako **Woodecky10** i ustaw je jako aktywne — wtedy zwykły `git push` działa.
- **Na kompie gdzie zalogowane są oba konta a GCM odpowiada jako mwlo1403** (sytuacja na starym kompie): push jednorazowy z pominięciem GCM:
  ```
  gh auth switch --hostname github.com --user Woodecky10
  git -c credential.helper= -c "credential.https://github.com.helper=!'C:\Program Files\GitHub CLI\gh.exe' auth git-credential" push origin <branch>
  gh auth switch --hostname github.com --user mwlo1403
  ```
- **PR-em (jak slice z 2026-06-18):** po pushu brancha `gh pr create --base main --head <branch> ...`, potem `gh pr merge <nr> --merge` (operacje API jako Woodecky10, bez git-push). Zdalny branch po merge: `gh api -X DELETE repos/Woodecky10/sklep-meblowy/git/refs/heads/<branch>`.

## Metoda pracy (tak prowadzone są podprojekty)
brainstorming → spec (`docs/superpowers/specs/`) → plan TDD (`docs/superpowers/plans/`) → implementacja subagent-driven (świeży subagent na task + recenzja po każdym + final whole-branch review) → merge. Panel admina jest **PL-only** (bez i18n). Server actions: `"use server"` + `requireAdmin()` + `createAdminClient()` + `revalidatePath`, zwracają `ActionResult`, updaty castowane `as never`. Komponenty klienckie używają `app/admin/_shared` (`Card`/`Field`/`ToastView`/`inputCls`) + `useTransition`.

## Następny krok
1. **Deploy zaległy:** uruchom migracje w Supabase (29/30/**31** — patrz wyżej). Bez migr. 31 panel zamówień i nowa karta „Dostawa" nie pokażą danych (karta degraduje się bezpiecznie — po prostu się nie renderuje).
2. **Wyślij właścicielce pytania** z `docs/2026-06-18-rozpoznanie-faktury-wysylka.md` (faktury/KSeF + wysyłka). Jej odpowiedzi odblokowują resztę podprojektów 3 i 4.
3. Po odpowiedziach: **podprojekt 3 (faktury przez KSeF)** — najważniejsze pytanie to z jakiego programu fakturowego korzysta księgowa (przesądza drogę), potem spec → plan → wdrożenie. Równolegle **reszta podprojektu 4 (wysyłka)** — termin dostawy + dane dla transportu + model kosztu.

## Drobne follow-upy (nieblokujące, do cleanupu BL)
- `schema.sql` jest niekompletnym baseline'em (pre-existing) — fresh-DB bootstrap z samego pliku byłby niepełny; źródłem prawdy są migracje.
- Martwy `syncProductsAction` + nieaktualny komentarz BL w `app/konto/zamowienia/actions.ts` — do sprzątnięcia przy pełnym usuwaniu BL.
