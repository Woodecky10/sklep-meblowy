// Czysta logika zdjęć w opiniach — BEZ `server-only` i bez importów serwerowych.
// Ten moduł czyta zarówno akcja serwerowa, jak i ReviewCard, który renderuje się
// wewnątrz klienckiej karuzeli na stronie głównej. Wciągnięcie tu czegokolwiek
// z ./supabase/server wsysałoby next/headers do drzewa klienta.
//
// Wzorzec przepisany z order-issues.ts (isOwnIssuePhotoUrl + validateOrderIssueInput).
// Osobny moduł, a nie rozbudowa tamtego, bo różnią się dwie rzeczy, które MUSZĄ
// się różnić: prefiks w Storage (`opinie/` vs `order-issues/`) i limit (3 vs 5).

// Limit zdjęć na jedną opinię. Ta sama liczba stoi w trzech bramkach: widżet nie
// pozwala wybrać czwartego, zapis odrzuca payload, a `check` w migracji 79
// odrzuca wiersz. Zmiana limitu to zmiana we WSZYSTKICH trzech.
export const MAX_REVIEW_PHOTOS = 3;

// Katalog w buckecie `products`. Reklamacje siedzą pod `order-issues/` i te
// prefiksy muszą zostać rozdzielne: gdyby opinie przyjmowały `order-issues/`,
// dowolne zdjęcie z reklamacji dałoby się wstawić do PUBLICZNEJ opinii samym
// przepisaniem URL-a w payloadzie.
export const REVIEW_PHOTO_DIR = "opinie";

export function reviewPhotoPrefix(supabaseUrl: string): string {
  return `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/products/${REVIEW_PHOTO_DIR}/`;
}

// Dozwolone znaki w NAZWIE pliku, czyli w tym, co zostaje z adresu po odcięciu
// prefiksu. Nazwy generujemy sami (`${Date.now()}-${randomUUID()}.${ext}`), więc
// ten ciasny wzorzec nie odcina niczego prawidłowego.
//
// ⚠️ NIE „upraszczaj" go i nie dopisuj tu znaków. Wzorzec pilnuje dwóch rzeczy
// naraz i obie są bramką, nie kosmetyką:
// - brak `/` — bez tego `opinie/../order-issues/<uuid>.jpg` przechodziło
//   walidację (segmenty `..` normalizują się dopiero przy PARSOWANIU adresu,
//   czyli PO niej), a przeglądarka i optymalizator obrazów pokazywały zdjęcie
//   z CUDZEJ REKLAMACJI podpisane jako „zdjęcie od klienta" na stronie głównej;
// - brak `%` — bez tego to samo wyjście z katalogu przechodzi w wersji
//   zakodowanej procentowo (`%2e%2e`, `%2f`), której wzorzec na surowe znaki
//   by nie zobaczył.
const NAZWA_PLIKU_RE = /^[A-Za-z0-9._-]+$/;

// Czy URL pochodzi z NASZEGO Storage i z katalogu opinii. Bez tego ktoś wstawi
// do opinii dowolny obrazek z internetu — a opinia ląduje na stronie głównej.
// supabaseUrl = NEXT_PUBLIC_SUPABASE_URL, przekazywane przez wołającego.
//
// Sam prefiks NIE wystarcza — patrz komentarz przy NAZWA_PLIKU_RE. Reszta
// adresu musi być pojedynczą nazwą pliku w katalogu `opinie/`.
export function isOwnReviewPhotoUrl(url: unknown, supabaseUrl: string): boolean {
  if (!supabaseUrl) return false;
  if (typeof url !== "string") return false;
  const prefix = reviewPhotoPrefix(supabaseUrl);
  if (!url.startsWith(prefix)) return false;
  return NAZWA_PLIKU_RE.test(url.slice(prefix.length));
}

// Ścieżka pliku w buckecie `products` dla NASZEGO URL-a zdjęcia z opinii,
// `null` dla wszystkiego innego. Woła to kasowanie opinii przez autora
// (/api/reviews DELETE), żeby sprzątnąć pliki, które BYŁY publiczne.
//
// Bramką jest tu dokładnie to samo isOwnReviewPhotoUrl, które pilnuje zapisu —
// i to jest wymóg, nie oszczędność: gdyby ta funkcja liczyła ścieżkę luźniej,
// kasowanie własnej opinii sięgałoby plików spoza katalogu `opinie/`, czyli
// np. cudzych reklamacji, klientem administracyjnym i z pominięciem RLS.
export function reviewPhotoPath(url: string, supabaseUrl: string): string | null {
  if (!isOwnReviewPhotoUrl(url, supabaseUrl)) return null;
  return `${REVIEW_PHOTO_DIR}/${url.slice(reviewPhotoPrefix(supabaseUrl).length)}`;
}

export type ReviewPhotosValidation =
  | { ok: true; value: string[] }
  | { ok: false; error: "count" | "url" };

// Bramka na zapis opinii — woła ją i ścieżka zalogowanego (/api/reviews),
// i ścieżka gościa (app/opinia/[token]/actions.ts).
//
// `undefined` znaczy „klient nie przysłał pola" i jest poprawnym brakiem zdjęć.
// Każda inna wartość, która nie jest tablicą (w tym `null` z zepsutego JSON-a),
// jest BŁĘDEM, nie brakiem — inaczej uszkodzony payload cicho gubiłby zdjęcia
// przy edycji istniejącej opinii.
export function validateReviewPhotos(
  photos: unknown,
  supabaseUrl: string
): ReviewPhotosValidation {
  if (photos === undefined) return { ok: true, value: [] };
  if (!Array.isArray(photos)) return { ok: false, error: "url" };
  // Limit PRZED prefiksem: komunikat „maksymalnie 3 zdjęcia" jest dla klienta
  // czytelniejszy niż „nieprawidłowe zdjęcie", gdy zawiniły oba warunki naraz.
  if (photos.length > MAX_REVIEW_PHOTOS) return { ok: false, error: "count" };
  if (!photos.every((p) => isOwnReviewPhotoUrl(p, supabaseUrl))) {
    return { ok: false, error: "url" };
  }
  // Deduplikacja, a nie błąd: ten sam adres dwa razy to nie jest atak, tylko
  // powtórzony klik. Odrzucenie zapisu byłoby dla klienta karą za nic, a
  // przepuszczenie duplikatu daje zduplikowane `key={url}` w trzech
  // rendererach zdjęć (ReviewCard, ReviewList, ReviewPhotoPicker) i
  // ostrzeżenie Reacta. Set zachowuje kolejność pierwszych wystąpień.
  return { ok: true, value: Array.from(new Set(photos as string[])) };
}

// Formularz gościa jedzie FormData, więc listę URL-i niesie JSON w jednym polu
// (ten sam wzorzec, co `photos` w submitOrderIssue). Zwraca `unknown`, bo
// rozstrzyganie należy do validateReviewPhotos — tu tylko odpakowujemy.
export function parseReviewPhotos(raw: unknown): unknown {
  if (raw === undefined || raw === null || raw === "") return [];
  if (typeof raw !== "string") return null;
  try {
    return JSON.parse(raw);
  } catch {
    // NIE `[]`: zepsuty JSON to błąd payloadu. Zwrócenie pustej listy
    // zapisałoby opinię BEZ zdjęć i klient nie dowiedziałby się dlaczego.
    return null;
  }
}
