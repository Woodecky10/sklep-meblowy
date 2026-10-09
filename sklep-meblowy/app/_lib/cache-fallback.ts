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
