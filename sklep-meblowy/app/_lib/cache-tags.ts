// Nazwy tagów cache'u (unstable_cache / revalidateTag) współdzielone przez
// moduły, które nie powinny się nawzajem importować.
//
// ⚠️ TEN MODUŁ MA ZOSTAĆ LIŚCIEM: zero importów, same stałe. Powód jest
// konkretny: `FACETS_CACHE_TAG` mieszkał w products.ts, a to 600 linii, które
// ciągną dalej supabase/server, categories, category-tree, localize,
// size-groups i sleep-size. Moduł potrzebujący SAMEGO STRINGA (jak
// search-vocabulary-server.ts, który dokłada ten tag do własnego cache'u)
// wciągał przez to cały ten graf — a trafia on docelowo do
// /api/search/suggest, najgorętszego endpointu sklepu.
//
// products.ts RE-EKSPORTUJE `FACETS_CACHE_TAG`, więc dotychczasowa ścieżka
// importu działa dalej i nie trzeba było ruszyć ani jednego z 15 miejsc
// wołających invalidateFacetsCache (app/admin/produkty/actions.ts ×8,
// app/admin/tkaniny/actions.ts ×5, plus importy).
export const FACETS_CACHE_TAG = "facets";

export const SEARCH_VOCABULARY_CACHE_TAG = "search-vocabulary";
