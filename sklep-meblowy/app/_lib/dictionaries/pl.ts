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
    profile: string;
    loggedInAs: string;
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
    featuredEmpty: string;
  };
  product: {
    addToCart: string;
    selectVariant: string;
    cornerSideHint: string;
    sizeLabel: string;
    omnibusLabel: string;
    saleBadge: string;
    outOfStock: string;
    recentlyViewedEyebrow: string;
    recentlyViewedHeading: string;
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
    warrantyLabel: string;
    warrantyDefault: string;
    deliveryTimeLabel: string;
    deliveryTimeDefault: string;
    deliveryCostNote: string;
    deliveryCostLink: string;
    reviewOne: string;
    reviewFew: string;
    reviewMany: string;
    reviewGuardLoggedOut: string;
    reviewGuardLogin: string;
    reviewGuardLoggedOutSuffix: string;
    reviewGuardNotPurchased: string;
  };
  fabrics: {
    eyebrow: string;
    heading: string;
    intro: string;
    groupNoSurcharge: string;
    colorsOne: string;
    colorsFew: string;
    colorsMany: string;
    swatchHeading: string;
    productionHeading: string;
    typeLabel: string;
    detailsLink: string;
    otherGroupLabel: string;
    notFoundTitle: string;
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
    deliveryNotice: string;
    deliveryNoticeLink: string;
    trustPayment: string;
    trustReturns: string;
    trustWarranty: string;
    crossSellEyebrow: string;
    crossSellHeading: string;
    toastAdded: string;
    viewCart: string;
  };
  bundle: {
    badge: string;
    savesFrom: string;
    saves: string;
    buy: string;
    see: string;
    withProducts: string;
    togetherLabel: string;
    bundleLabel: string;
    addToCart: string;
    chooseOptions: string;
    cartGroupLabel: string;
    removeBundle: string;
    discountLine: string;
    promoExcluded: string;
    thisProduct: string;
    bundlePriceFrom: string;
  };
  common: {
    loading: string;
    filter: string;
    sort: string;
    all: string;
    back: string;
    more: string;
    close: string;
    noImage: string;
    browseShop: string;
    confirm: string;
    cancel: string;
    confirmTitle: string;
  };
  meta: {
    tagline: string;
    description: string;
    keywords: string;
    homeTitle: string;
    shopTitle: string;
    wishlistTitle: string;
  };
  shop: {
    eyebrow: string;
    title: string;
    allProducts: string;
    searchPrefix: string;
    emptyTitle: string;
    emptyHint: string;
    // Rozwijanie dłuższego opisu kolekcji nad filtrami (>1 akapit).
    descriptionMore: string;
    descriptionLess: string;
  };
  filter: {
    sortAlpha: string;
    sortNewest: string;
    sortPriceAsc: string;
    sortPriceDesc: string;
    sortLabel: string;
    category: string;
    collection: string;
    color: string;
    material: string;
    price: string;
    inStock: string;
    clear: string;
    allCategories: string;
    allCollections: string;
    priceRange: string;
    priceFrom: string;
    priceTo: string;
    removeFilter: string;
    dimensions: string;
    dimWidth: string;
    dimDepth: string;
    dimHeight: string;
  };
  cookies: {
    heading: string;
    body: string;
    privacyLink: string;
    necessary: string;
    necessaryDesc: string;
    analytics: string;
    analyticsDesc: string;
    marketing: string;
    marketingDesc: string;
    customize: string;
    save: string;
    onlyNecessary: string;
    acceptAll: string;
  };
  notFound: {
    eyebrow: string;
    heading: string;
    body: string;
    home: string;
    popularCategories: string;
  };
  wishlist: {
    emptyTitle: string;
    emptyHint: string;
    addAria: string;
    removeAria: string;
    addedToast: string;
    removedToast: string;
  };
  search: {
    placeholderInline: string;
    placeholderModal: string;
    searching: string;
    noImageShort: string;
  };
  a11y: {
    toggleTheme: string;
    language: string;
    carousel: string;
    slideOf: string;
    prevSlide: string;
    nextSlide: string;
    goToSlide: string;
    zoomImage: string;
    showImage: string;
    prevImage: string;
    nextImage: string;
    productImageDialog: string;
    backToTop: string;
  };
  pagination: {
    prev: string;
    next: string;
    page: string;
  };
  inquiry: {
    dialogAria: string;
    eyebrow: string;
    heading: string;
    productLabel: string;
    sentTitle: string;
    nameLabel: string;
    emailLabel: string;
    phoneLabel: string;
    phoneHint: string;
    messageLabel: string;
    messageHint: string;
    messagePlaceholder: string;
    submit: string;
    submitting: string;
    cancel: string;
    privacyNote: string;
  };
  orderIssue: {
    triggerButton: string;
    dialogAria: string;
    eyebrow: string;
    heading: string;
    categoryLabel: string;
    itemLabel: string;
    wholeOrder: string;
    messageLabel: string;
    messageHint: string;
    messagePlaceholder: string;
    photosLabel: string;
    photosHint: string;
    addPhoto: string;
    uploading: string;
    photoAlt: string;
    removePhoto: string;
    sentTitle: string;
    submit: string;
    submitting: string;
    cancel: string;
    privacyNote: string;
  };
  trustBar: {
    eyebrow: string;
    heading: string;
    producer: string;
    quality: string;
    delivery: string;
    deliveryScope: string;
    warranty: string;
    iconFree: string;
    iconYears: string;
    iconYearsWord: string;
  };
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
    profile: "Profil",
    loggedInAs: "Zalogowano jako",
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
    featuredEmpty: "Brak polecanych produktów.",
  },
  product: {
    addToCart: "Dodaj do koszyka",
    selectVariant: "Wybierz wariant",
    cornerSideHint: "Strony pokazane patrząc od frontu",
    sizeLabel: "Rozmiar",
    omnibusLabel: "Najniższa cena z 30 dni przed obniżką",
    saleBadge: "Promocja",
    outOfStock: "Niedostępny",
    recentlyViewedEyebrow: "Dla Ciebie",
    recentlyViewedHeading: "Ostatnio oglądane",
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
    returns: "Zwrot do 14 dni",
    // Gwarancja w bloku "✓" prawej kolumny: label + wartość z product.warranty
    // (fallback do warrantyDefault gdy pole puste) — jak deliveryTimeLabel/Default.
    warrantyLabel: "Gwarancja:",
    warrantyDefault: "2 lata",
    deliveryTimeLabel: "Czas dostawy:",
    deliveryTimeDefault: "14–21 dni roboczych",
    deliveryCostNote: "Darmowa wysyłka na terenie całej Polski",
    deliveryCostLink: "Szczegóły dostawy",
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
  fabrics: {
    eyebrow: "Mollien",
    heading: "Tkaniny",
    intro: "Poznaj tkaniny dostępne w naszych meblach — pogrupowane według grup cenowych. Kliknij tkaninę, aby zobaczyć opis i pełny wzornik kolorów.",
    groupNoSurcharge: "bez dopłaty",
    colorsOne: "kolor",
    colorsFew: "kolory",
    colorsMany: "kolorów",
    swatchHeading: "Wzornik kolorów",
    productionHeading: "Meble w tej tkaninie",
    typeLabel: "Typ",
    detailsLink: "szczegóły",
    otherGroupLabel: "Pozostałe",
    notFoundTitle: "Tkanina nie znaleziona",
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
    deliveryFrom: "Gratis",
    deliveryHint: "na terenie całej Polski",
    deliveryNotice:
      "Wysyłka jest darmowa na terenie całej Polski — nie doliczamy żadnych kosztów dostawy.",
    deliveryNoticeLink: "Szczegóły dostawy",
    trustPayment: "Bezpieczna płatność Stripe",
    trustReturns: "Zwrot do 14 dni",
    trustWarranty: "Gwarancja 2 lata",
    crossSellEyebrow: "Polecane do koszyka",
    crossSellHeading: "Może Cię zainteresować",
    toastAdded: "Dodano do koszyka",
    viewCart: "Zobacz koszyk",
  },
  bundle: {
    badge: "W zestawie taniej",
    savesFrom: "Oszczędzasz od",
    saves: "Oszczędzasz",
    buy: "Kup w zestawie",
    see: "Zobacz zestaw",
    withProducts: "Razem z:",
    togetherLabel: "Razem osobno",
    bundleLabel: "W zestawie",
    addToCart: "Dodaj zestaw do koszyka",
    chooseOptions: "Wybierz opcje dla każdego mebla",
    cartGroupLabel: "Zestaw",
    removeBundle: "Usuń zestaw",
    discountLine: "Rabat za zestaw",
    promoExcluded: "Kod rabatowy nie obejmuje produktów kupionych w zestawie",
    thisProduct: "ten produkt",
    bundlePriceFrom: "Cena zestawu: od",
  },
  common: {
    loading: "Ładowanie…",
    filter: "Filtruj",
    sort: "Sortuj",
    all: "Wszystkie",
    back: "Wstecz",
    more: "Więcej",
    close: "Zamknij",
    noImage: "Brak zdjęcia",
    browseShop: "Przeglądaj sklep",
    confirm: "Potwierdź",
    cancel: "Anuluj",
    confirmTitle: "Potwierdzenie",
  },
  meta: {
    tagline: "Meble premium",
    description:
      "Odkryj kolekcję eleganckich mebli premium. Sofy, narożniki, łóżka, fotele i pufy najwyższej jakości.",
    keywords: "meble, sofy, narożniki, łóżka, fotele, sklep meblowy",
    homeTitle: "Meble Premium | Eleganckie Meble do Twojego Domu",
    shopTitle: "Sklep",
    wishlistTitle: "Ulubione",
  },
  shop: {
    eyebrow: "Kolekcja",
    title: "Sklep",
    allProducts: "Wszystkie produkty",
    searchPrefix: "Wyniki",
    emptyTitle: "Brak produktów",
    emptyHint: "Spróbuj zmienić filtry lub frazę wyszukiwania.",
    descriptionMore: "Czytaj więcej",
    descriptionLess: "Zwiń opis",
  },
  filter: {
    sortAlpha: "Alfabetycznie A-Z",
    sortNewest: "Najnowsze",
    sortPriceAsc: "Cena: rosnąco",
    sortPriceDesc: "Cena: malejąco",
    sortLabel: "Sortuj:",
    category: "Kategoria",
    collection: "Kolekcja",
    color: "Kolor",
    material: "Tkanina",
    price: "Cena",
    inStock: "Dostępne od ręki",
    clear: "Wyczyść",
    allCategories: "Wszystkie kategorie",
    allCollections: "Wszystkie kolekcje",
    priceRange: "Zakres cenowy",
    priceFrom: "od",
    priceTo: "do",
    removeFilter: "Usuń filtr",
    dimensions: "Wymiary",
    dimWidth: "Szerokość",
    dimDepth: "Głębokość",
    dimHeight: "Wysokość",
  },
  cookies: {
    heading: "Dbamy o Twoją prywatność",
    body: "Używamy plików cookies, aby sklep działał poprawnie i aby móc lepiej rozumieć, jak z niego korzystasz. Niezbędne cookies są zawsze aktywne. Analitykę i marketing włączamy wyłącznie za Twoją zgodą. Szczegóły w",
    privacyLink: "Polityce prywatności",
    necessary: "Niezbędne",
    necessaryDesc: "Wymagane do działania sklepu: sesja logowania, koszyk, zabezpieczenia.",
    analytics: "Analityczne",
    analyticsDesc: "Anonimowe statystyki ruchu – pomagają ulepszać sklep.",
    marketing: "Marketingowe",
    marketingDesc: "Reklamy dopasowane do Twoich zainteresowań.",
    customize: "Dostosuj",
    save: "Zapisz wybór",
    onlyNecessary: "Tylko niezbędne",
    acceptAll: "Akceptuj wszystkie",
  },
  notFound: {
    eyebrow: "Strona nie znaleziona",
    heading: "Hmm, ta strona zniknęła jak ostatnia sztuka w wyprzedaży",
    body: "Link mógł się zdezaktualizować albo produkt został zdjęty z oferty. Wróć na stronę główną albo przejrzyj sklep — na pewno znajdziemy coś ciekawego.",
    home: "Strona główna",
    popularCategories: "Popularne kategorie",
  },
  wishlist: {
    emptyTitle: "Twoja lista ulubionych jest pusta",
    emptyHint:
      "Klikaj serce na karcie produktu, żeby zachować swoje typy na później. Wrócisz do nich w każdej chwili tutaj.",
    addAria: "Dodaj do ulubionych",
    removeAria: "Usuń z ulubionych",
    addedToast: "Dodano do ulubionych",
    removedToast: "Usunięto z ulubionych",
  },
  search: {
    placeholderInline: "Szukaj mebli…",
    placeholderModal: "Szukaj produktów…",
    searching: "Szukam…",
    noImageShort: "brak",
  },
  a11y: {
    toggleTheme: "Przełącz motyw",
    language: "Język",
    carousel: "Polecane kolekcje",
    slideOf: "z",
    prevSlide: "Poprzedni slajd",
    nextSlide: "Następny slajd",
    goToSlide: "Przejdź do slajdu",
    zoomImage: "Powiększ zdjęcie",
    showImage: "Pokaż zdjęcie",
    prevImage: "Poprzednie zdjęcie",
    nextImage: "Następne zdjęcie",
    productImageDialog: "Zdjęcie produktu",
    backToTop: "Wróć na górę",
  },
  pagination: {
    prev: "Poprzednia strona",
    next: "Następna strona",
    page: "Strona",
  },
  inquiry: {
    dialogAria: "Zapytanie o niestandardowy wariant",
    eyebrow: "Pytanie",
    heading: "Inny kolor, własny wariant?",
    productLabel: "Produkt",
    sentTitle: "Wiadomość wysłana ✓",
    nameLabel: "Twoje imię i nazwisko",
    emailLabel: "Email",
    phoneLabel: "Telefon (opcjonalny)",
    phoneHint: "Jeśli wolisz kontakt telefoniczny.",
    messageLabel: "Wiadomość",
    messageHint: "Napisz jakiego koloru / wariantu szukasz.",
    messagePlaceholder:
      "Szukam wersji w kolorze butelkowej zieleni. Czy macie tkaninę Velvet w tym odcieniu?",
    submit: "Wyślij zapytanie",
    submitting: "Wysyłam...",
    cancel: "Anuluj",
    privacyNote: "Twoje dane będą wykorzystane wyłącznie do odpowiedzi na to zapytanie.",
  },
  orderIssue: {
    triggerButton: "Zgłoś problem",
    dialogAria: "Zgłoszenie problemu z zamówieniem",
    eyebrow: "Reklamacja",
    heading: "Zgłoś problem z zamówieniem",
    categoryLabel: "Czego dotyczy problem?",
    itemLabel: "Której pozycji dotyczy?",
    wholeOrder: "Całe zamówienie",
    messageLabel: "Opis problemu",
    messageHint: "Opisz krótko co się stało.",
    messagePlaceholder: "Narożnik dotarł z uszkodzonym rogiem — załączam zdjęcia.",
    photosLabel: "Zdjęcia (opcjonalnie, max 5)",
    photosHint: "Zdjęcie uszkodzenia bardzo przyspiesza rozpatrzenie.",
    addPhoto: "+ Dodaj zdjęcie",
    uploading: "Wgrywam...",
    photoAlt: "Zdjęcie",
    removePhoto: "Usuń zdjęcie",
    sentTitle: "Zgłoszenie wysłane ✓",
    submit: "Wyślij zgłoszenie",
    submitting: "Wysyłam...",
    cancel: "Anuluj",
    privacyNote: "Twoje dane i zdjęcia wykorzystamy wyłącznie do rozpatrzenia tego zgłoszenia.",
  },
  // Pasek zaufania (TrustBar) — treści 1:1 z grafik docs/grafika-zaufanie-sklepu*.png
  trustBar: {
    eyebrow: "MEBLE Z CHARAKTEREM",
    heading: "Dlaczego warto kupować u nas?",
    producer: "Polski producent",
    quality: "Gwarancja jakości",
    delivery: "Darmowa dostawa",
    deliveryScope: "na terenie całej Polski",
    warranty: "2 lata gwarancji",
    iconFree: "0 zł",
    iconYears: "2",
    iconYearsWord: "LATA",
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
