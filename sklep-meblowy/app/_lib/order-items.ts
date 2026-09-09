// Nazwa pozycji zamówienia do wyświetlenia. Moduł CZYSTY (bez server-only
// i bez bazy) — czytają go i strony serwerowe, i komponenty klientowe,
// i szablony maili.
//
// Od migracji 82 pozycja ma nazwę z DWÓCH możliwych źródeł:
// - `product.name` — pozycja z katalogu (join po `product_id`),
// - `custom_name` — pozycja spoza katalogu, wpisana ręcznie w panelu
//   (zamówienia zewnętrzne, zgłoszenie pracownicy 2026-09-09).

export type NamedOrderItem = {
  // `not null default ''` w bazie, więc pozycja z katalogu ma tu PUSTY STRING.
  // Opcjonalne w typie, bo `select("*")` na bazie bez tej kolumny (okno między
  // wdrożeniem kodu a ręczną aplikacją migracji 82) po prostu jej nie zwraca.
  custom_name?: string | null;
  product?: { name: string } | null;
};

export function orderItemDisplayName(item: NamedOrderItem, fallback: string): string {
  // custom_name PIERWSZE: wiersz ma dokładnie jedno z dwóch źródeł nazwy, a gdy
  // ktoś kiedyś wpisze oba, ręczna nazwa jest tą, którą widziała pracownica.
  // `trim()` nie jest kosmetyką — pusty string to DOMYŚLNA wartość kolumny dla
  // KAŻDEJ pozycji z katalogu, więc branie go dosłownie skasowałoby nazwy
  // produktów w całej historii zamówień.
  const custom = item.custom_name?.trim();
  if (custom) return custom;
  const name = item.product?.name?.trim();
  if (name) return name;
  return fallback;
}
