// Widened type (string leaves) used by de.ts to avoid literal-type conflicts from `as const`.
export type PlShape = {
  nav: { shop: string; about: string; contact: string; cart: string; favorites: string; account: string; search: string };
  product: { addToCart: string; selectVariant: string; outOfStock: string; reviews: string; reviewsHeading: string; description: string; relatedProducts: string; relatedProductsHeading: string; inquireColors: string };
  cart: { empty: string; emptyHint: string; checkout: string; total: string; continueShopping: string; summary: string; goToShop: string };
  common: { loading: string; filter: string; sort: string; all: string; back: string; more: string };
  footer: {
    information: string;
    about: string;
    contact: string;
    account: string;
    orderHistory: string;
    delivery: string;
    returns: string;
    terms: string;
    privacy: string;
    tagline: string;
    rightsReserved: string;
  };
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
    selectVariant: "Wybierz wariant",
    outOfStock: "Niedostępny",
    reviews: "Opinie",
    reviewsHeading: "Co mówią klienci",
    description: "Opis",
    relatedProducts: "Podobne produkty",
    relatedProductsHeading: "Podobne produkty",
    inquireColors: "Zapytaj o inne kolory",
  },
  cart: {
    empty: "Koszyk jest pusty",
    emptyHint: "Dodaj produkty do koszyka, aby kontynuować zakupy.",
    checkout: "Przejdź do kasy",
    total: "Razem",
    continueShopping: "Kontynuuj zakupy",
    summary: "Podsumowanie",
    goToShop: "Przejdź do sklepu",
  },
  common: {
    loading: "Ładowanie…",
    filter: "Filtruj",
    sort: "Sortuj",
    all: "Wszystkie",
    back: "Wstecz",
    more: "Więcej",
  },
  footer: {
    information: "Informacje",
    about: "O nas",
    contact: "Kontakt",
    account: "Moje konto",
    orderHistory: "Historia zamówień",
    delivery: "Dostawa i płatności",
    returns: "Zwroty i reklamacje",
    terms: "Regulamin",
    privacy: "Polityka prywatności",
    tagline:
      "Tworzymy przestrzenie, w których chce się żyć. Meble najwyższej jakości, z pasją do detalu.",
    rightsReserved: "Wszelkie prawa zastrzeżone.",
  },
} as const;
