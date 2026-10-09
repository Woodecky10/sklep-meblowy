import { PHASE_PRODUCTION_BUILD } from "next/constants";

// Zapas per WYWOŁANIE dla loaderów z unstable_cache.
//
// Odczyt W ŚRODKU unstable_cache ma przy błędzie Supabase RZUCAĆ, a nie zwracać
// pustej listy. Next nie zapisuje wyjątku, a przy odświeżaniu w tle zostawia
// poprzedni dobry wpis (node_modules/next/dist/server/web/spec-extension/
// unstable-cache.js — `.catch` przy pendingRevalidates zwraca cachedResponse).
// Zwrócone [] zapisałby jak poprawny wynik i strona pokazywałaby „nic" przez
// całe okno revalidate: 2026-10-09 /tkaniny bez ani jednej tkaniny,
// 2026-10-06 sklep bez kategorii — w obu przypadkach baza była w porządku.
//
// Wyjątek łapiemy dopiero tu, NA ZEWNĄTRZ cache: zapas dostaje tylko to jedno
// żądanie, a błąd trafia do logów Vercela (wcześniej znikał bez śladu).
// Wzorzec istniał już w store-settings.ts i theme-settings.ts.
//
// „Tylko to jedno żądanie" działa, bo strony są dynamiczne (layout czyta
// headers() dla nonce CSP). Trasy ISR — feed.xml, sitemap.xml — cache'ują całą
// odpowiedź, więc zapas zapisałby się piętro wyżej: one NIE używają withFallback,
// tylko rzucają (patrz isBuildPhase niżej).
export async function withFallback<T>(
  label: string,
  read: () => Promise<T>,
  fallback: T
): Promise<T> {
  try {
    return await read();
  } catch (err) {
    console.error(`[${label}] odczyt z bazy nie powiódł się — zapas tylko dla tego żądania`, err);
    return fallback;
  }
}

// Trasa ISR przy błędzie bazy: w działającym sklepie RZUCIĆ — Next zostawia
// wtedy ostatnią dobrą wersję i ponawia za ≤30 s (node_modules/next/dist/server/
// response-cache/index.js ~290-306). Zwrócona odpowiedź, także 503 albo wersja
// okrojona, zapisałaby się ZAMIAST niej na całe okno revalidate
// (build/templates/app-route.js ~306-331). Przy buildzie rzucenie wywaliłoby
// deploy, więc tylko tam trasa oddaje wersję awaryjną — Next ustawia NEXT_PHASE
// na czas builda (build/index.js), a odpowiedź ≥400 nie trafia wtedy do cache.
export function isBuildPhase(): boolean {
  return process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD;
}
