// Widened type (string leaves) used by de.ts to avoid literal-type conflicts from `as const`.
export type PlShape = {
  nav: { shop: string; about: string; contact: string; cart: string; favorites: string; account: string; search: string };
  product: { addToCart: string; outOfStock: string; reviews: string; description: string; relatedProducts: string; inquireColors: string };
  cart: { empty: string; checkout: string; total: string; continueShopping: string };
  common: { loading: string; filter: string; sort: string; all: string; back: string; more: string };
};

export const pl = {
  nav: {
    shop: "Sklep",
    about: "O nas",
    contact: "Kontakt",
    cart: "Koszyk",
    favorites: "Ulubione",
    account: "Konto",
    search: "Szukaj",
  },
  product: {
    addToCart: "Dodaj do koszyka",
    outOfStock: "Niedostępny",
    reviews: "Opinie",
    description: "Opis",
    relatedProducts: "Podobne produkty",
    inquireColors: "Zapytaj o inne kolory",
  },
  cart: {
    empty: "Twój koszyk jest pusty",
    checkout: "Przejdź do kasy",
    total: "Suma",
    continueShopping: "Kontynuuj zakupy",
  },
  common: {
    loading: "Ładowanie…",
    filter: "Filtruj",
    sort: "Sortuj",
    all: "Wszystkie",
    back: "Wstecz",
    more: "Więcej",
  },
} as const;
