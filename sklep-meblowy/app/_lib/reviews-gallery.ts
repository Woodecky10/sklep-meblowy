// Czysta logika galerii zdjęć z opinii — BEZ `server-only` i bez importów
// serwerowych. Ten moduł czyta kliencki komponent galerii, więc wciągnięcie tu
// czegokolwiek z ./supabase/server wsysałoby next/headers do drzewa klienta
// (ta sama zasada, co w reviews-photos.ts).

import type { PublicReview } from "./reviews";

export type GalleryPhoto = {
  src: string;
  // Id opinii, z której zdjęcie pochodzi — klucz Reacta, bo ten sam produkt ma
  // zdjęcia od wielu autorów.
  reviewId: string;
};

export type ProductPhotoGroup = {
  productId: string;
  // null, gdy produkt zniknął z katalogu. Sekcja i tak zostaje: zdjęcie od
  // klienta jest treścią, a nie ozdobą karty produktu.
  productName: string | null;
  photos: GalleryPhoto[];
};

// Spłaszcza opinie w listę „produkt → wszystkie jego zdjęcia", sklejając wkład
// RÓŻNYCH autorów o tym samym meblu. Tego właśnie oczekuje klient przeglądający
// same zdjęcia: chce zobaczyć jeden narożnik w wielu mieszkaniach, a nie
// zdjęcia jednej opinii.
//
// Kolejność grup i zdjęć w grupie idzie za kolejnością wejścia (opinie
// przychodzą najnowsze pierwsze), więc świeże zdjęcia są u góry bez osobnego
// sortowania.
//
// `photos` bywa nieobecne na danych sprzed migracji 79 — stąd sprawdzenie
// Array.isArray, a nie samo `?? []`.
export function groupReviewPhotosByProduct(reviews: PublicReview[]): ProductPhotoGroup[] {
  const grupy = new Map<string, ProductPhotoGroup>();
  const widziane = new Map<string, Set<string>>();

  for (const r of reviews) {
    const photos = Array.isArray(r.photos) ? r.photos : [];
    if (photos.length === 0) continue;

    let grupa = grupy.get(r.product_id);
    if (!grupa) {
      grupa = { productId: r.product_id, productName: r.product_name, photos: [] };
      grupy.set(r.product_id, grupa);
      widziane.set(r.product_id, new Set());
    }
    const juzMa = widziane.get(r.product_id)!;

    for (const src of photos) {
      // Ten sam adres w dwóch opiniach o tym samym produkcie to nie błąd
      // (walidacja zapisu dedupikuje tylko WEWNĄTRZ jednej opinii), ale
      // w galerii dałby dwa identyczne kafelki i dwa te same zdjęcia
      // pod strzałkami lightboxa.
      if (juzMa.has(src)) continue;
      juzMa.add(src);
      grupa.photos.push({ src, reviewId: r.id });
    }
  }

  return [...grupy.values()];
}
