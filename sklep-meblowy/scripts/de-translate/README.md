# Masowe tłumaczenie treści sklepu PL → DE

Zestaw skryptów do przepchnięcia całego katalogu i treści stron przez tłumaczenie
niemieckie. Same skrypty **nie tłumaczą** — przygotowują paczki dla agentów (LLM),
sprawdzają to, co wróciło, i wgrywają do kolumn `_de` w bazie.

Uruchamianie przez `tsx` (skrypty importują pliki `.ts` z `app/_lib/`):

```
npm run de:export     # 1. zrzut treści PL z bazy → work/
npm run de:batch      # 2. podział na partie → work/batches/
#    …tu pracują agenci: czytają work/batches/<plik>.json,
#      piszą work/out/<ten sam plik>.json
npm run de:validate   # 3. kontrola wyników  (--merge scala do work/de/translations.json)
npm run de:import     # 4. DRY-RUN zapisu    (--apply faktycznie zapisuje)
```

Flagi przekazuje się po `--`, np. `npm run de:export -- --force-products`.

## Zasady bezpieczeństwa

- **Baza Supabase to ŻYWA PRODUKCJA.** `export`, `batch` i `validate` są
  wyłącznie do odczytu. `import` bez `--apply` też niczego nie zapisuje.
- `import --apply` uruchamia **człowiek**, po przejrzeniu dry-runu. Nigdy agent.
- `import` zawsze pobiera **świeże wiersze z bazy** i liczy klucze tłumaczeń
  z aktualnych tekstów PL — nie ufa `work/pl/*.json`. Jeśli ktoś zdążył
  poprawić tekst w adminie po eksporcie, klucz się nie zgodzi i produkt zostanie
  **pominięty z raportem**, a nie zapisany nieaktualnym tłumaczeniem.
- Produkt zapisujemy tylko w **komplecie** (nazwa + wszystkie widoczne sekcje +
  alty zdjęć). `/de` podmienia CAŁĄ tablicę `description_sections`, więc
  niekompletna tablica = dziury na stronie produktu.
- Domyślnie ruszamy tylko puste `_de`. `--force` nadpisuje wszystko,
  `--force-products` — wszystko, ale tylko w tabeli `products`.
- `work/` jest w `.gitignore` (zrzut produkcji, regenerowalny).

## Jednostka tłumaczenia

```jsonc
{ "key": "a1b2c3d4e5f6", "kind": "section_body", "text": "<p>…</p>", "ctx": "produkt „…": treść sekcji 2" }
```

`key` = 12 pierwszych znaków sha256(`"<kind>\n<text>"`). Ten sam tekst w tej samej
roli daje ten sam klucz w eksporcie i w imporcie — stąd dedup (jeden opis
powtarzający się w 40 produktach tłumaczy się raz) i stąd odporność importu na
nieświeży `work/`.

`ctx` to podpowiedź dla tłumacza (gdzie ten tekst siedzi). `ref` pojawia się przy
`slide_highlight` — wskazuje slajd i klucz jego tytułu.

## Format wyniku agenta

Dla partii `work/batches/products-03.json` agent zapisuje
`work/out/products-03.json`:

```json
{
  "a1b2c3d4e5f6": "<p>Deutscher Text …</p>",
  "0f9e8d7c6b5a": "Bequemes Sofa"
}
```

Klucz → tekst DE. Nic więcej: bez komentarzy, bez zagnieżdżeń, bez kluczy spoza
partii (walidator je wypisze jako ostrzeżenie).

Zasady dla tłumacza: pełny glosariusz i styl w [`GLOSSARY.md`](./GLOSSARY.md) —
agent czyta go PRZED partią. Twarde minimum, którego pilnuje walidator:

- zachować **wszystkie tagi HTML** w tej samej kolejności (walidator porównuje
  sekwencję nazw tagów),
- zachować **liczby i URL-e** bez zmian,
- **żadnych polskich znaków** w wyniku,
- `slide_highlight` **musi** być podłańcuchem przetłumaczonego tytułu tego samego
  slajdu (podświetlenie szuka go w tytule, case-insensitive),
- nazwy własne modeli, kody tkanin i wymiary zostają.

## Pliki w `work/`

| plik | co w nim jest |
| --- | --- |
| `pl/products.json` | produkty w zakresie tłumaczenia: `{id, slug, name, is_active, has_de, sections[]}` (sekcje już znormalizowane do tekstu WIDOCZNEGO w sklepie) |
| `pl/misc.json` | surowe wiersze pozostałych tabel (PL + aktualne `_de`), `page_blocks` z całym `content` |
| `pl/maps.json` | wartości, których **brakuje** w mapach z `app/_lib/de-content-maps.ts` — te trzeba dopisać do kodu RĘCZNIE, nie idą do bazy |
| `units.json` | wszystkie jednostki po dedupie |
| `batches/*.json` | partie zadań + `index.json` ze spisem |
| `out/*.json` | wyniki agentów (tworzy agent) |
| `de/translations.json` | scalone tłumaczenia (`validate --merge`) — wejście dla `import` |
| `validate-report.json` | pełny raport walidacji |
| `reference/existing_de.json` | 17 produktów mających już DE — materiał na glosariusz. **UWAGA:** pary PL↔DE bywają przesunięte (PL było edytowane po tłumaczeniu), traktować jako słownik terminów, nie wzorzec |

## Grupy partii

| grupa | rodzaje jednostek | limit znaków |
| --- | --- | --- |
| `products` | `product_name`, `section_title`, `section_body`, `image_alt`, `caption` | 25 000 |
| `fabrics` | `fabric_description`, `fabric_short_info` | 30 000 |
| `misc` | cała reszta (kategorie, kolekcje, zestawy, slajdy, kafelki, teksty serwisu, strony, bloki, mapy kodu) | 45 000 |

Jednostki `slide_*` są wypychane na początek grupy `misc`, żeby tytuł slajdu i
jego wyróżnione słowo trafiły do tej samej partii (inaczej nie da się ich
uzgodnić). Limity zmienia się flagami `--limit-products=`, `--limit-fabrics=`,
`--limit-misc=`.

## Czego pipeline NIE dotyka

- `product_reviews` (opinie klientów) — świadomie pominięte,
- `fabrics.name_de` — nazwy tkanin to nazwy własne/kody,
- `products.description`, `products.color/material` — poza zakresem tej rundy
  (kolory/materiały mają mapy w `de-content-maps.ts`),
- mapy w `app/_lib/de-content-maps.ts` — `pl/maps.json` mówi tylko, czego w nich
  brakuje; wpisy dopisuje człowiek do kodu.
