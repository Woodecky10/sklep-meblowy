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
  const [collections, { data: productsRaw }] = await Promise.all([
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
