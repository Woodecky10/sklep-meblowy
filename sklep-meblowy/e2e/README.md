# Testy E2E (Playwright)

Testy responsywności panelu admina: brak poziomego ucinania na 375/768/1280 px,
zwijany sidebar (hamburger + drawer) na mobile/tablet, statyczny sidebar na
desktopie, select statusu mieszczący się w ekranie.

## Wymagania

Plik `.env.e2e` w katalogu projektu (gitignorowany) z kontem admina:

```
E2E_ADMIN_EMAIL=admin@example.com
E2E_ADMIN_PASSWORD=twoje-haslo
# opcjonalnie — domyślnie testuje https://www.mollien.pl:
# E2E_BASE_URL=http://localhost:3100
```

## Uruchomienie

```
npm run test:e2e
```

Przeglądarka (chromium) instaluje się raz: `npx playwright install chromium`.

- Domyślnie testuje produkcję (mollien.pl).
- Lokalnie: `npm run build && PORT=3100 npm run start`, ustaw `E2E_BASE_URL=http://localhost:3100`.

Uwaga: testy logują się realnym kontem admina (tylko odczyt + zrzuty do
`e2e/screens/`). Sesja i zrzuty są gitignorowane.
