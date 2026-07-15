# Uruchomienie projektu na nowym komputerze

## Wymagania
- Node.js 20+ i npm
- Git (+ konto z dostępem do repo `Woodecky10/sklep-meblowy`)

## Kroki

1. **Klon i zależności**
   ```bash
   git clone https://github.com/Woodecky10/sklep-meblowy.git
   cd sklep-meblowy/sklep-meblowy   # uwaga: projekt żyje w podkatalogu repo
   npm install
   ```

2. **Sekrety — `.env.local`** (gitignorowane, przenieś ręcznie ze starego komputera / z Vercela → Settings → Environment Variables). Wymagane zmienne:
   ```
   NEXT_PUBLIC_SUPABASE_URL=
   NEXT_PUBLIC_SUPABASE_ANON_KEY=
   SUPABASE_SERVICE_ROLE_KEY=
   STRIPE_SECRET_KEY=
   STRIPE_WEBHOOK_SECRET=
   NEXT_PUBLIC_APP_URL=http://localhost:3000
   ```
   (Jeśli po migracji na Przelewy24 dojdą zmienne P24 — patrz PR #48.)

3. **Start**
   ```bash
   npm run dev
   ```

## ⚠️ WAŻNE
- **localhost używa TEJ SAMEJ bazy Supabase co PRODUKCJA** — każda mutacja danych w dev dotyka żywego sklepu.
- Testy: `npm test` (vitest, bez dotykania bazy); typy: `npx tsc --noEmit`; build: `npm run build`.
- Testy e2e (`npm run test:e2e`) wymagają dodatkowo pliku `.env.e2e` z `E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD`; domyślny `E2E_BASE_URL` celuje w **produkcyjny** www.mollien.pl — nowy kod testuj z `E2E_BASE_URL=http://localhost:3000`.
- Migracje SQL w `supabase/migrations/` są już zaaplikowane na prod (stan: przez 54 włącznie, jeśli krok D zmergowany — sprawdź najwyższy numer i opis w PR-ach). Nowe migracje zapuszczane przez Supabase MCP.
