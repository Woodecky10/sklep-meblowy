// Stała i typy współdzielone przez warstwę danych (collections.ts, server-only)
// i komponent kliencki (HomeCollections.tsx). Świadomie w OSOBNYM pliku bez
// żadnych server-only importów (next/cache, next/headers przez supabase/server):
// gdyby "use client" HomeCollections.tsx importował HOME_COLLECTIONS_VISIBLE
// bezpośrednio z collections.ts, Turbopack próbowałby zbudować cały ten moduł
// (łącznie z revalidateTag/cookies) do bundla przeglądarki i build by padał.
// collections.ts re-eksportuje te same nazwy, więc reszta kodu (testy, admin)
// importuje je tak jak dotąd z "@/app/_lib/collections".
import type { Collection } from "./types";

// Ile kafelków widać przed rozwinięciem. 6 dzieli się bez resztki przez 1, 2
// i 3 — tyle kolumn ma siatka na kolejnych szerokościach ekranu — więc granica
// zwinięcia wypada na końcu pełnego rzędu na każdym urządzeniu.
export const HOME_COLLECTIONS_VISIBLE = 6;

// Minimalny wiersz produktu potrzebny do kafelka. Świadomie NIE `Product`:
// mozaika ma alt="" i nie używa nazw ani opisów, więc nie ma po co ich pobierać.
export type CollectionProductRow = {
  collection_id: string | null;
  images: string[] | null;
};

export type CollectionTile = {
  collection: Collection; // zlokalizowana (label/description)
  thumbnails: string[]; // do 4 adresów zdjęć na mozaikę
  productCount: number; // liczba AKTYWNYCH produktów w kolekcji
};
