// Kontrakt odpowiedzi rozwijki podpowiedzi (/api/search/suggest) — typy plus
// obie strony drutu: funkcja BUDUJĄCA ciało odpowiedzi (route handler)
// i funkcja CZYTAJĄCA to, co przyszło z sieci (przeglądarka).
//
// ⚠️ MODUŁ MA ZOSTAĆ LIŚCIEM: zero importów, zero `server-only`, zero dostępu do
// bazy. Powód jest konkretny — importuje go KLIENCKI SearchBox (wisi w headerze
// każdej strony sklepu), a route handler po drugiej stronie ciągnie supabase,
// search-correction i słownik katalogu. Gdyby te typy zostały w route.ts,
// import czegokolwiek WYKONYWALNEGO stamtąd wciągnąłby ten graf do bundle'a
// przeglądarki. Ten sam powód, dla którego powstał cache-tags.ts.
//
// route.ts re-eksportuje oba typy, więc dotychczasowa ścieżka importu
// (`from "@/app/api/search/suggest/route"`) dalej działa.

export type SearchSuggestion = {
  id: string;
  name: string;
  price: number;
  image: string | null;
  category: string;
};

// Odpowiedź endpointu. Pola korekty są OPCJONALNE i przychodzą TYLKO wtedy, gdy
// korekta literówki naprawdę zaszła i coś znalazła (patrz search-correction.ts).
export type SuggestResponse = {
  items: SearchSuggestion[];
  // Fraza KLIENTA — obecna ⇔ jego fraza dała zero podpowiedzi, a poprawiona coś
  // znalazła.
  correctedFrom?: string;
  // ⚠️ Fraza użyta w zapytaniu, ale obecna TYLKO WTEDY, GDY WOLNO JĄ POKAZAĆ
  // KLIENTOWI (canShowCorrection w search-correction.ts). Brak tego pola przy
  // obecnym `correctedFrom` znaczy: korekta zaszła, ale zdanie ma jej nie
  // cytować — nigdy nie pokazujemy rdzenia w rodzaju `lozk`. UI NIE POWTARZA
  // u siebie tej reguły: dwa miejsca decydujące o tym samym cicho by się
  // rozjechały.
  correctedTo?: string;
};

// Odpowiedź endpointu → ciało, które naprawdę idzie na drut. STRONA PISZĄCA
// (route handler); czytającą jest normalizeSuggestResponse niżej. Obie stoją
// w jednym pliku celowo — to jest jeden kontrakt i ma się zmieniać razem.
//
// ⚠️ PO CO TO ISTNIEJE, czyli po co w URL-u siedzi `v=2` (NIE USUWAĆ tego
// parametru jako „zbędnego"):
//
// Deploy nie wymienia otwartych kart klientów, a sklep trzyma sesje godzinami.
// Karta otwarta PRZED deployem odpytuje NOWY endpoint STARYM bundlem. Stary
// bundle robił `Array.isArray(data) ? data : []` — dostając obiekt widzi
// `false` i pokazuje PUSTĄ rozwijkę dla KAŻDEJ frazy, nie tylko dla literówki,
// aż do przeładowania strony. Nic nie rzuca, więc nikt się o tym nie dowie.
// Dotyczy to każdego deployu, nie tylko tego jednego.
//
// Dlatego kształt jest NEGOCJOWANY: kto prosi o nowy (`v=2` — czyli wyłącznie
// nasz własny SearchBox), dostaje obiekt z polami korekty; kto nie prosi
// (stary bundle, cache pośredni, czyjś curl), dostaje gołą tablicę dokładnie
// jak przed dołożeniem korekty literówek.
//
// ⚠️ `v=2` NIE JEST publicznym API ani wersjonowaniem endpointu i nie ma być
// tak dokumentowane. To uzgodnienie między NASZYM klientem a NASZYM serwerem,
// oba deployowane razem — jedyne, co je rozjeżdża, to karta zostawiona otwarta.
export function suggestResponseBody(
  response: SuggestResponse,
  wantsObject: boolean
): SuggestResponse | SearchSuggestion[] {
  // Bez `v=2` pola korekty przepadają — i tak ma być: stary bundle nie ma czym
  // ich pokazać, a kształt musi być bit w bit tym, który zna.
  return wantsObject ? response : response.items;
}

// Odpowiedź z sieci → kształt, na którym UI może polegać.
//
// ⚠️ PRZYJMUJE TEŻ GOŁĄ TABLICĘ, czyli STARY kształt tej odpowiedzi, i to nie
// jest nadgorliwość: deploy nie wymienia otwartych kart klientów. Nowy bundle
// odpytujący starszy deployment (rollback, żądanie pod adres poprzedniej wersji)
// dostanie dokładnie tamten kształt i ma zachować się jak dziś — pokazać
// podpowiedzi, nigdy nie rzucić. Dzisiejszy kod robił `Array.isArray(data)
// ? data : []` i tę odporność ma zachować.
//
// Wyjątek z tej ścieżki to zepsuta rozwijka w headerze KAŻDEJ strony sklepu,
// a w repo nie ma error.tsx.
//
// Czego tu NIE ma i mieć nie musi: walidacji pojedynczej podpowiedzi. To ten sam
// poziom zaufania co dziś (`data` szło wprost do stanu), a element listy
// pochodzi z NASZEGO route'a, nie od klienta. Nie ma tu też ani jednej struktury
// indeksowanej frazą klienta — czytamy wyłącznie stałe klucze — więc gotcha
// z łańcuchem prototypu (`OBJ["constructor"]` → funkcja `Object`) tej funkcji
// nie dotyczy.
export function normalizeSuggestResponse(data: unknown): SuggestResponse {
  if (Array.isArray(data)) return { items: data as SearchSuggestion[] };
  if (data === null || typeof data !== "object") return { items: [] };

  const raw = data as {
    items?: unknown;
    correctedFrom?: unknown;
    correctedTo?: unknown;
  };
  const items = Array.isArray(raw.items) ? (raw.items as SearchSuggestion[]) : [];

  // Puste stringi odsiewamy razem z nie-stringami: zdanie «Pokazujemy wyniki
  // dla » jest gorsze niż brak zdania.
  const correctedFrom =
    typeof raw.correctedFrom === "string" && raw.correctedFrom !== ""
      ? raw.correctedFrom
      : undefined;
  const correctedTo =
    typeof raw.correctedTo === "string" && raw.correctedTo !== ""
      ? raw.correctedTo
      : undefined;

  // `correctedTo` bez `correctedFrom` jest bez sensu (zdanie znikąd) i takiej
  // odpowiedzi endpoint nie produkuje — ale produkować ją może inna wersja po
  // drugiej stronie, więc wariant jest domknięty tutaj, a nie w komponencie.
  if (correctedFrom === undefined) return { items };
  return { items, correctedFrom, correctedTo };
}
