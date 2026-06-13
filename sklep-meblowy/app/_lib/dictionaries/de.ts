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
    selectVariant: "Variante wählen",
    outOfStock: "Nicht verfügbar",
    reviews: "Bewertungen",
    reviewsHeading: "Was unsere Kunden sagen",
    description: "Beschreibung",
    relatedProducts: "Ähnliche Produkte",
    relatedProductsHeading: "Ähnliche Produkte",
    inquireColors: "Nach anderen Farben fragen",
  },
  cart: {
    empty: "Ihr Warenkorb ist leer",
    emptyHint: "Legen Sie Produkte in den Warenkorb, um mit dem Einkauf fortzufahren.",
    checkout: "Zur Kasse",
    total: "Gesamt",
    continueShopping: "Weiter einkaufen",
    summary: "Zusammenfassung",
    goToShop: "Zum Shop",
  },
  common: {
    loading: "Wird geladen…",
    filter: "Filtern",
    sort: "Sortieren",
    all: "Alle",
    // back: intentionally omitted — triggers PL fallback
    more: "Mehr",
  },
  footer: {
    information: "Informationen",
    about: "Über uns",
    contact: "Kontakt",
    account: "Mein Konto",
    orderHistory: "Bestellverlauf",
    delivery: "Versand und Zahlung",
    returns: "Rückgabe und Reklamation",
    terms: "AGB",
    privacy: "Datenschutzerklärung",
    tagline:
      "Wir schaffen Räume, in denen man leben möchte. Möbel von höchster Qualität, mit Liebe zum Detail.",
    rightsReserved: "Alle Rechte vorbehalten.",
  },
};
