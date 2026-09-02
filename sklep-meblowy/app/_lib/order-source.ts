// Źródła zamówień spoza sklepu (spec 2026-09-02). Etykieta idzie 1:1 do maila
// „Dziękujemy za zamówienie" w miejsce „[Allegro]" — to, co tu stoi, czyta
// klient. W `orders.source` null oznacza zamówienie złożone przez stronę.
//
// Lista jest w kodzie, nie w panelu — decyzja właściciela: nazwa w mailu ma być
// zawsze jednolita, a nowy marketplace to jedna linijka tutaj.
export const ORDER_SOURCES = [
  "Allegro",
  "OLX",
  "Empik",
  "Facebook / Instagram",
  "Telefon / e-mail",
] as const;

// Opcja „Inne" w <select>: wtedy nazwę wpisuje admin i ona jest obowiązkowa.
export const OTHER_SOURCE = "Inne";

// Zgodne z CHECK w migracji 81.
export const SOURCE_MAX_LENGTH = 60;

export type SourceResolution =
  | { ok: true; source: string }
  | { ok: false; error: string };

// `selected` to wartość z <select> (jedna z ORDER_SOURCES albo OTHER_SOURCE),
// `customName` to pole „Nazwa źródła" widoczne tylko przy „Inne".
export function resolveOrderSource(selected: unknown, customName: unknown): SourceResolution {
  if (typeof selected !== "string") return { ok: false, error: "Wybierz źródło zamówienia" };
  if ((ORDER_SOURCES as readonly string[]).includes(selected)) {
    return { ok: true, source: selected };
  }
  if (selected !== OTHER_SOURCE) return { ok: false, error: "Wybierz źródło zamówienia" };

  const name = typeof customName === "string" ? customName.trim() : "";
  if (!name) return { ok: false, error: "Podaj nazwę źródła przy opcji „Inne”" };
  if (name.length > SOURCE_MAX_LENGTH) {
    return { ok: false, error: `Nazwa źródła może mieć najwyżej ${SOURCE_MAX_LENGTH} znaków` };
  }
  return { ok: true, source: name };
}
