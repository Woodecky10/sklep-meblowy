// Limit czasu na pojedyncze wywołanie do Supabase.
//
// Ani `fetch`, ani supabase-js nie mają domyślnego limitu: zawieszone połączenie
// wisi tak długo, na ile pozwoli platforma. 2026-08-27 render strony głównej stał
// przez 300 s i skończył się 504 (request stxsb-1787817205243 w logach Vercela),
// a odwiedzający przez ten czas widział „utracono połączenie z siecią". Limit
// zamienia taki zawis w szybki, jawny błąd.
//
// Storage ma limit osobny i dużo wyższy: wgranie zdjęcia produktu z panelu to
// megabajty przez łącze właścicielki, a przerwany upload to utracony plik.
// Zapytania do bazy i do auth idą w milisekundach, więc 5 s to i tak ~150-krotny
// zapas względem normy zmierzonej po przeniesieniu funkcji do Frankfurtu.
export const LIMIT_DANE_MS = 5_000;
export const LIMIT_STORAGE_MS = 60_000;

export function limitDlaUrl(url: string): number {
  return url.includes("/storage/v1/") ? LIMIT_STORAGE_MS : LIMIT_DANE_MS;
}

function urlZWejscia(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

export function fetchZLimitem(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const limit = AbortSignal.timeout(limitDlaUrl(urlZWejscia(input)));
  // Sygnał wywołującego musi zostać uszanowany — AbortSignal.any przerywa
  // zarówno na jego abort, jak i na nasz limit. Podmiana samego signal
  // zgubiłaby anulowanie żądania przez Next przy przerwanym połączeniu.
  const signal = init?.signal ? AbortSignal.any([init.signal, limit]) : limit;
  return fetch(input, { ...init, signal });
}
