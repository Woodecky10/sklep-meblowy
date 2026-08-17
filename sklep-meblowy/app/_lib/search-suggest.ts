// Kontrakt odpowiedzi rozwijki podpowiedzi (/api/search/suggest) — typy plus
// jedna funkcja czytająca to, co przyszło z sieci.
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
