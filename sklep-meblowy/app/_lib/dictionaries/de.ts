import type { PlShape } from "./pl";

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

// common.back is deliberately NOT translated — fallback to PL value will apply.
export const de: DeepPartial<PlShape> = {
  nav: {
    shop: "Shop",
    about: "Über uns",
    contact: "Kontakt",
    cart: "Warenkorb",
    favorites: "Favoriten",
    account: "Konto",
    search: "Suchen",
  },
  product: {
    addToCart: "In den Warenkorb",
    outOfStock: "Nicht verfügbar",
    reviews: "Bewertungen",
    description: "Beschreibung",
    relatedProducts: "Ähnliche Produkte",
    inquireColors: "Nach anderen Farben fragen",
  },
  cart: {
    empty: "Ihr Warenkorb ist leer",
    checkout: "Zur Kasse",
    total: "Summe",
    continueShopping: "Weiter einkaufen",
  },
  common: {
    loading: "Wird geladen…",
    filter: "Filtern",
    sort: "Sortieren",
    all: "Alle",
    // back: intentionally omitted — triggers PL fallback
    more: "Mehr",
  },
};
