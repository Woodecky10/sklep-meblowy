// Widened type (string leaves) used by de.ts to avoid literal-type conflicts from `as const`.
export type PlShape = {
  nav: {
    shop: string;
    about: string;
    contact: string;
    cart: string;
    favorites: string;
    account: string;
    search: string;
    allInSection: string;
    homeAria: string;
    menu: string;
    adminPanel: string;
    myAccount: string;
    orders: string;
    logout: string;
    login: string;
    register: string;
  };
  topbar: { slogan: string };
  home: {
    collectionsEyebrow: string;
    collectionsHeading: string;
    tileDiscover: string;
    featuredHeading: string;
    seeAll: string;
    seriesEyebrow: string;
    seriesHeading: string;
    seeCollection: string;
    productOne: string;
    productFew: string;
    productMany: string;
  };
  product: {
    addToCart: string;
    selectVariant: string;
    outOfStock: string;
    reviews: string;
    reviewsHeading: string;
    description: string;
    relatedProducts: string;
    relatedProductsHeading: string;
    inquireColors: string;
    breadcrumbHome: string;
    breadcrumbShop: string;
    specificationEyebrow: string;
    specificationHeading: string;
    descriptionEyebrow: string;
    descriptionHeading: string;
    fullDescriptionEyebrow: string;
    fullDescriptionHeading: string;
    crossSellEyebrow: string;
    crossSellRecommendedPrefix: string;
    crossSellFallbackHeading: string;
    fullCollectionEyebrow: string;
    specWidth: string;
    specWeight: string;
    specMaterial: string;
    specBaseColor: string;
    specConstruction: string;
    specDeliveryTime: string;
    specWarranty: string;
    dimensionsHint: string;
    returns: string;
    warranty: string;
    deliveryTimeLabel: string;
    deliveryTimeDefault: string;
    reviewOne: string;
    reviewFew: string;
    reviewMany: string;
    reviewGuardLoggedOut: string;
    reviewGuardLogin: string;
    reviewGuardLoggedOutSuffix: string;
    reviewGuardNotPurchased: string;
  };
  cart: {
    empty: string;
    emptyHint: string;
    checkout: string;
    total: string;
    continueShopping: string;
    summary: string;
    goToShop: string;
    eyebrow: string;
    yourProducts: string;
    clearCart: string;
    noImage: string;
    remove: string;
    addNotes: string;
    notesLabel: string;
    notesPlaceholder: string;
    notesCharsSuffix: string;
    notesUnsaved: string;
    removeNotes: string;
    promoLabel: string;
    promoPlaceholder: string;
    promoApply: string;
    promoDiscountPercent: string;
    promoDiscountAmount: string;
    promoRemove: string;
    productsCount: string;
    pieces: string;
    discount: string;
    delivery: string;
    deliveryFrom: string;
    deliveryHint: string;
    trustPayment: string;
    trustReturns: string;
    trustWarranty: string;
    crossSellEyebrow: string;
    crossSellHeading: string;
  };
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
    allInSection: "Wszystkie",
    homeAria: "strona główna",
    menu: "Menu",
    adminPanel: "Panel admina",
    myAccount: "Moje konto",
    orders: "Zamówienia",
    logout: "Wyloguj",
    login: "Zaloguj się",
    register: "Zarejestruj się",
  },
  topbar: {
    slogan: "Polski producent mebli tapicerowanych",
  },
  home: {
    collectionsEyebrow: "Kolekcje",
    collectionsHeading: "Znajdź swój styl",
    tileDiscover: "Odkryj",
    featuredHeading: "Polecane produkty",
    seeAll: "Wszystkie →",
    seriesEyebrow: "Serie mebli",
    seriesHeading: "Nasze kolekcje",
    seeCollection: "Zobacz kolekcję",
    productOne: "produkt",
    productFew: "produkty",
    productMany: "produktów",
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
    breadcrumbHome: "Dom",
    breadcrumbShop: "Sklep",
    specificationEyebrow: "Specyfikacja",
    specificationHeading: "Szczegóły produktu",
    descriptionEyebrow: "Opis produktu",
    descriptionHeading: "Wszystko, co musisz wiedzieć",
    fullDescriptionEyebrow: "Pełny opis",
    fullDescriptionHeading: "Opis produktu",
    crossSellEyebrow: "Dopełnienie",
    crossSellRecommendedPrefix: "Polecane",
    crossSellFallbackHeading: "Może Cię zainteresować",
    fullCollectionEyebrow: "Pełna kolekcja",
    specWidth: "Wymiary",
    specWeight: "Waga",
    specMaterial: "Materiał",
    specBaseColor: "Kolor bazowy",
    specConstruction: "Konstrukcja",
    specDeliveryTime: "Czas realizacji",
    specWarranty: "Gwarancja",
    dimensionsHint: "szer. × gł. × wys.",
    returns: "Zwrot do 30 dni",
    warranty: "Gwarancja 2 lata",
    deliveryTimeLabel: "Czas dostawy:",
    deliveryTimeDefault: "14–21 dni roboczych",
    reviewOne: "opinia",
    reviewFew: "opinie",
    reviewMany: "opinii",
    reviewGuardLoggedOut: "Opinie mogą dodawać tylko osoby, które kupiły produkt.",
    reviewGuardLogin: "Zaloguj się",
    reviewGuardLoggedOutSuffix:
      ", a jeśli ten produkt jest w Twoich zamówieniach, zobaczysz tu formularz.",
    reviewGuardNotPurchased:
      "Opinię możesz dodać po dokonaniu zakupu tego produktu. Weryfikujemy autentyczność opinii na podstawie historii zamówień.",
  },
  cart: {
    empty: "Koszyk jest pusty",
    emptyHint: "Dodaj produkty do koszyka, aby kontynuować zakupy.",
    checkout: "Przejdź do kasy",
    total: "Razem",
    continueShopping: "Kontynuuj zakupy",
    summary: "Podsumowanie",
    goToShop: "Przejdź do sklepu",
    eyebrow: "Koszyk",
    yourProducts: "Twoje produkty",
    clearCart: "Wyczyść koszyk",
    noImage: "Brak",
    remove: "Usuń",
    addNotes: "+ Dodaj uwagi do tego produktu",
    notesLabel: "Uwagi do tego produktu",
    notesPlaceholder: "np. róż jak na zdjęciu 2, proszę o telefon przed dostawą",
    notesCharsSuffix: "znaków",
    notesUnsaved: " · niezapisane",
    removeNotes: "Usuń uwagi",
    promoLabel: "Kod rabatowy",
    promoPlaceholder: "np. MOLLIEN10",
    promoApply: "Zastosuj",
    promoDiscountPercent: "Zniżka",
    promoDiscountAmount: "Zniżka",
    promoRemove: "Usuń",
    productsCount: "Produkty",
    pieces: "szt.",
    discount: "Zniżka",
    delivery: "Dostawa",
    deliveryFrom: "od 99 zł",
    deliveryHint:
      "dokładną wycenę podajemy telefonicznie lub mailowo po zamówieniu",
    trustPayment: "Bezpieczna płatność Stripe",
    trustReturns: "Zwrot do 30 dni",
    trustWarranty: "Gwarancja 2 lata",
    crossSellEyebrow: "Polecane do koszyka",
    crossSellHeading: "Może Cię zainteresować",
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
