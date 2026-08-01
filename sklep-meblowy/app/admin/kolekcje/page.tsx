import { requireAdmin } from "@/app/_lib/admin";
import {
  byHomeOrder,
  countActiveProductsByCollection,
  type CollectionProductRow,
} from "@/app/_lib/collection-tiles";
import { getAllCollections } from "@/app/_lib/collections";
import { createAdminClient } from "@/app/_lib/supabase/server";
import type { Product } from "@/app/_lib/types";
import CollectionsEditor from "./CollectionsEditor";

export const metadata = { title: "Kolekcje — Admin" };

export default async function AdminCollectionsPage() {
  await requireAdmin();

  const supabase = await createAdminClient();
  const [collections, { data: productsRaw, error: productsError }] = await Promise.all([
    getAllCollections(),
    // Picker produktów potrzebuje tylko nazwy, miniatury, kategorii i ceny —
    // NIE opisów HTML ani sekcji opisu, które przy select("*") ciągnęły cały
    // katalog razem z treścią. is_active jest wymagane: licznik aktywnych
    // produktów liczy się z tych wierszy (patrz niżej).
    supabase
      .from("products")
      .select("id, name, images, collection_id, is_active, category, price")
      .order("name", { ascending: true }),
  ]);

  // Błąd zapytania NIE może zniknąć po cichu. Bez produktów licznik każdej
  // kolekcji wynosi 0, więc panel wyszarzyłby wszystkie wiersze, zgasił kreskę
  // i przy każdej kolekcji napisał "brak aktywnych produktów — nie pokaże się",
  // czyli skłamałby, że na stronę główną nie trafia nic. Gorzej: picker w
  // edytorze wystartowałby z pustym zaznaczeniem, a zapis kolekcji odpiąłby od
  // niej WSZYSTKIE produkty. Dlatego zamiast fałszywego stanu pokazujemy błąd
  // i w ogóle nie renderujemy edytora (banner jak w /admin/produkty).
  if (productsError) {
    return (
      <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-red-800 dark:text-red-300 text-sm">
        Nie udało się wczytać produktów, więc lista kolekcji nie została pokazana
        — liczniki i przypisania byłyby nieprawdziwe. Odśwież stronę za chwilę.
        Szczegóły techniczne: {productsError.message}
      </div>
    );
  }

  const products = (productsRaw ?? []) as Product[];

  // Licznik liczy TYLKO aktywne produkty — tym samym helperem, co strona
  // główna, żeby "aktywny produkt" nie miał w panelu innej definicji.
  // Świadomie BEZ .filter((p) => p.is_active) tutaj: countActiveProductsByCollection
  // filtruje samo przez isActiveProductRow (jedyne źródło prawdy, patrz komentarz
  // w collection-tiles.ts) — duplikowanie warunku w JS to dokładnie ten rozjazd,
  // którego ten moduł ma zapobiegać.
  const rows: CollectionProductRow[] = products.map((p) => ({
    collection_id: p.collection_id,
    images: p.images,
    is_active: p.is_active,
  }));
  const counts = countActiveProductsByCollection(rows);

  // getAllCollections() sortuje po label (SQL .order("label")). Panel musi
  // renderować w TEJ SAMEJ kolejności co strona główna — inaczej przeciągnięcie
  // przenumerowałoby kolekcje względem alfabetu i cicho skasowało poprzedni
  // układ, a kreska "poniżej dopiero po rozwinięciu" stałaby w złym miejscu.
  // Kopia jest obowiązkowa: wynik getAllCollections jest cache'owany
  // (unstable_cache + cache) i współdzielony, a sort() mutuje w miejscu.
  const ordered = [...collections].sort(byHomeOrder);

  return (
    <CollectionsEditor
      initialCollections={ordered}
      allProducts={products}
      productCounts={Object.fromEntries(counts)}
    />
  );
}
