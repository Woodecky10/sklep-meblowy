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

// Czy URL pochodzi z NASZEGO Storage i z katalogu opinii. Bez tego ktoś wstawi
// do opinii dowolny obrazek z internetu — a opinia ląduje na stronie głównej.
// supabaseUrl = NEXT_PUBLIC_SUPABASE_URL, przekazywane przez wołającego.
export function isOwnReviewPhotoUrl(url: unknown, supabaseUrl: string): boolean {
  if (!supabaseUrl) return false;
  return typeof url === "string" && url.startsWith(reviewPhotoPrefix(supabaseUrl));
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
  return { ok: true, value: photos as string[] };
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
