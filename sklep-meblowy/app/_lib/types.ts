// Kategorie są teraz dynamiczne (z DB, edytowane przez admin panel) —
// reprezentujemy slug jako zwykły string. Walidacja istnienia odbywa się
// po stronie DB przez FK products.category → categories.slug.
export type Category = string;

// `data` jest po OBU stronach świadomie. Bywają błędy, po których na serwerze
// coś już POWSTAŁO i klient musi się o tym dowiedzieć — np. zamówienie próbek
// jest zapisane w bazie, a padła dopiero rejestracja płatności. Bez tego kanału
// formularz widzi „błąd", odblokowuje przycisk, klient klika drugi raz i składa
// DRUGIE zamówienie (patrz app/probki/actions.ts + SampleForm.tsx). Kształt
// ładunku ustala konkretna akcja i opisuje go przy `return` — tu zostaje
// `unknown`, bo to typ współdzielony przez cały panel.
export type ActionResult =
  | { ok: true; message?: string; data?: unknown }
  | { ok: false; error: string; data?: unknown };

export type ProductDimensions = {
  width: number;
  depth: number;
  height: number;
};

// Definicja typu wariantu (np. "Strona": ["Lewa","Prawa"])
// value_prices: opcjonalna dopłata per wartość opcji (np. {"Premium": 200}).
// Dopłaty wybranych wartości sumują sie i dodawane sa do ceny bazowej produktu.
// Brak wpisu = 0 zl. Gdy zdefiniowane, sa zrodlem prawdy dla ceny wariantu.
export type ProductOption = {
  name: string;
  values: string[];
  value_prices?: Record<string, number>;
  // Zdjęcia per wartość opcji (np. mebel w danej tkaninie). Dla opcji strony
  // narożnika (Strona) po wyborze idą na początek galerii karty produktu
  // (getVariantImages); dla pozostałych opcji pokazują się jako swatche
  // w selektorze (VariantSelector), nie w głównej galerii.
  // Brak wpisu = brak zdjęć wariantowych. Puste tablice nie są zapisywane.
  value_images?: Record<string, string[]>;
  // Admin zaznaczył „Filtr w sklepie" — opcja pojawia się jako filtr na /sklep
  // (facety liczone w getFacetSource). Brak/false = opcja nie filtruje.
  filterable?: boolean;
};

// Override-y wyswietlanych nazw — admin moze zmienic "Wariant" -> "Kolor"
// i "01 bez drewniany stelaz" -> "Bez drewniany". Zapisane oddzielnie zeby
// kolejny import nie nadpisal ich (import zwraca surowe nazwy).
export type ProductVariantOverrides = {
  // np. {"Wariant": "Kolor"}
  option_names?: Record<string, string>;
  // np. {"Wariant": {"01 bez drewniany stelaz": "Bez drewniany"}}
  value_labels?: Record<string, Record<string, string>>;
};

export type ProductVariants = {
  options: ProductOption[];
  overrides?: ProductVariantOverrides;
};

// Cecha produktu — wszystko co admin wrzuca w "Cechy produktu"
// trafia tutaj jako para {key, value}. Array (nie obiekt) żeby zachować
// kolejność — admin może świadomie ustawić kolejność wyświetlania.
export type ProductFeature = {
  key: string;
  value: string;
};

// Sekcja opisu produktu — IKEA-style akordeony na karcie produktu.
// Discriminated union: text lub image (oba zarządzane ręcznie w panelu).
// Sekcje opisu są zarządzane ręcznie przez admina w /admin/produkty/[id]
// (DescriptionSectionsEditor).
export type ProductDescriptionSectionText = {
  kind: "text";
  // title + body wpisane przez admina (gdy admin_custom=true) lub
  // zaimportowane historycznie — zarządzane ręcznie.
  title: string;
  body: string;
  // Per-product admin overrides (ukrycie sekcji itp.).
  // Render w sklepie: admin_title || title, admin_body || body.
  // hidden=true → sekcja ukryta przed klientem.
  // Override-y mają sens tylko dla sekcji z admin_custom=false —
  // dla admin_custom sekcji edytujemy bezpośrednio title/body.
  admin_title?: string;
  admin_body?: string;
  hidden?: boolean;
  // Sekcja dodana przez admina (własna, nie z importu). Merge logic NIE
  // próbuje match-ować jej do żadnych pól importu — istnieje niezależnie,
  // analogicznie do sekcji image. Title/body są edytowalne
  // bezpośrednio (nie przez admin_title/admin_body).
  admin_custom?: boolean;
};

export type ProductDescriptionSectionImage = {
  kind: "image";
  image_url: string;
  image_alt: string;
  caption?: string;
  // Tryb wyświetlania na karcie produktu. Brak pola = „całe zdjęcie"
  // (naturalne proporcje, nic nie ucinane). "wide" = kadr panoramiczny 16:9
  // z przycięciem (object-cover) — dawny, jedyny wygląd sprzed tego pola.
  display?: "wide";
};

export type ProductDescriptionSection =
  | ProductDescriptionSectionText
  | ProductDescriptionSectionImage;

export type Product = {
  id: string;
  name: string;
  description: string;
  price: number;
  category: Category;
  images: string[];
  stock: number;
  color: string | null;
  material: string | null;
  dimensions: ProductDimensions | null;
  weight: number | null;
  construction: string | null;
  delivery_time: string | null;
  warranty: string | null;
  // Pełen zestaw cech produktu — duplikuje też te które mają dedykowane
  // kolumny (kolor, materiał itd.) dla wygody wyświetlania. Pusta tablica
  // gdy produkt nie ma żadnych cech.
  features: ProductFeature[];
  // Sekcje opisu (IKEA-style akordeony). Zarządzane ręcznie przez admina
  // w DescriptionSectionsEditor.
  description_sections: ProductDescriptionSection[];
  variants: ProductVariants | null;
  collection_id: string | null;
  // Pozycja produktu WEWNĄTRZ jego kolekcji (migracja 75). Mniejsze = wcześniej;
  // przy równych rozstrzyga nazwa. Ustawiana przeciąganiem w /admin/kolekcje.
  // Obowiązuje wszędzie, gdzie kolekcja występuje jako kolekcja (slider, lista,
  // „Pełna kolekcja" na karcie produktu, mozaika na stronie głównej) — ustępuje
  // dopiero, gdy klient sam wybierze sortowanie albo wpisze frazę.
  collection_sort_order: number;
  // Grupa rozmiarów (migracja 35) — łączy osobne produkty tego samego mebla
  // w różnych rozmiarach. size_group: wspólny klucz; size_label: etykieta tego
  // rozmiaru ("140×200 cm"). Selektor rozmiaru na karcie produktu pokazuje
  // rodzeństwo z tym samym size_group. Pass-through PL/DE (brak kolumn _de).
  size_group: string | null;
  size_label: string | null;
  // Omnibus (migracja 36) — poziom produktu (dla produktów bez wariantów).
  sale_price: number | null;
  omnibus_price: number | null;
  // Harmonogram promocji (migracja 69). sale_price wyżej = cena OBOWIĄZUJĄCA
  // TERAZ (pisze ją wyłącznie reconciler z sale-schedule.ts); poniżej jest PLAN,
  // który reconciler wprowadza w życie. Daty to dni Europe/Warsaw, granice włącznie.
  sale_price_planned: number | null;
  sale_from: string | null;
  sale_to: string | null;
  // Ręczne nadpisanie napisu na wstążce (maks. 16 znaków). Niezależne od ceny —
  // wstążka pokaże się także bez obniżki (panel ostrzega wtedy o Omnibusie).
  promo_badge: string | null;
  // Widoczność w sklepie (RLS). false = ukryty. deactivation_source: kto ukrył.
  is_active: boolean;
  deactivation_source: "auto" | "manual" | null;
  created_at: string;
};

export type Collection = {
  id: string;
  slug: string;
  label: string;
  label_de: string | null;
  description: string | null;
  description_de: string | null;
  // Kolejność na stronie głównej (migracja 66). Mniejsze = wyżej; przy równych
  // rozstrzyga label. Ustawiana przeciąganiem w /admin/kolekcje.
  sort_order: number;
  // Czy kolekcja pokazuje się w sekcji kolekcji na stronie głównej (migracja 66).
  // Nie wpływa na /sklep?kolekcja=... ani na kartę produktu.
  show_on_home: boolean;
  created_at: string;
  updated_at: string;
};

// Zestaw mebli (spec 2026-07-16) — admin łączy 2+ produktów, rabat % lub
// kwotowy od sumy cen efektywnych składników. Tabele bundles/bundle_items.
export type Bundle = {
  id: string;
  slug: string;
  name: string;
  name_de?: string | null;
  description: string | null;
  description_de?: string | null;
  discount_type: "percent" | "amount";
  discount_value: number;
  is_active: boolean;
  created_at: string;
};

// Zestaw z dociągniętymi (aktywnymi, zlokalizowanymi) produktami-składnikami,
// w kolejności position. Warstwa odczytu zwraca TYLKO komplety (>= 2 składniki,
// wszystkie aktywne) — patrz bundles-server.ts.
export type BundleWithComponents = Bundle & { components: Product[] };

// Grupa cenowa tkanin (migracja 56) — 3 stałe wpisy (code niezmienny), nazwy
// i kwota dopłaty edytowalne w adminie. Dopłata efektywna tkaniny =
// surcharge grupy + fabrics.price (korekta). UWAGA: to INNY byt niż
// FabricGroup z fabric-groups.ts (grupowanie po category w pickerze).
export type FabricPriceGroup = {
  id: string;
  code: string;
  name: string;
  name_de: string | null;
  surcharge: number;
  sort_order: number;
  created_at: string;
};

// Definicja cechy tkaniny (migracja 64) — edytowalna w /admin/tkaniny.
// `icon` to klucz z biblioteki w app/_lib/fabric-properties.ts, nie plik.
export type FabricPropertyDefRow = {
  id: string;
  code: string;
  label: string;
  label_de: string | null;
  icon: string;
  sort_order: number;
  created_at: string;
};

// Katalog tkanin (migracja 37) — reużywalny zbiór nazw używanych jako wartości
// opcji wariantu „Tkanina". name_de null → na /de fallback do name.
export type Fabric = {
  id: string;
  name: string;
  name_de: string | null;
  // Numery/kolory kolekcji (np. ["02","04","09"]). Puste = tkanina bez kolorów.
  colors: string[];
  // Zdjęcie próbki per kolor: { numer -> URL }. Tylko kolory z wgranym zdjęciem.
  color_images: Record<string, string>;
  // Dopłata do ceny bazowej gdy wybrana ta tkanina (zł, >= 0).
  price: number;
  sort_order: number;
  // Kategoria/typ do grupowania w pickerze wariantów (np. "welur"). Null = bez kategorii.
  category: string | null;
  // Grupa cenowa (FK fabric_groups.id, NOT NULL — migracja 56).
  group_id: string;
  // Adres strony /tkaniny/[slug] — generowany z nazwy przy tworzeniu, stabilny.
  slug: string;
  // Opis na stronę tkaniny (sanityzowany HTML). description_de null → fallback PL.
  description: string | null;
  description_de: string | null;
  // Krótkie info o tkaninie (dymek obok „szczegóły" w pickerze). Zwykły tekst,
  // osobne od description. short_info_de null → fallback PL.
  short_info: string | null;
  short_info_de: string | null;
  // Cechy tkaniny (kody z app/_lib/fabric-properties.ts) — pigułki przy
  // wyborze tkaniny na karcie produktu. Pusto = nic się nie pokazuje.
  properties: string[];
  // Wybrane produkty pokazywane w sekcji „Meble w tej tkaninie" na stronie
  // tkaniny (kolejność = kolejność w tablicy; max 20 w adminie). Nieznane/
  // nieaktywne id pomijane przy renderze.
  featured_product_ids: string[];
  created_at: string;
};

export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  address: Address | null;
  created_at: string;
};

export type Address = {
  street: string;
  city: string;
  postal_code: string;
  country: string;
  // Imię i nazwisko adresata (potrzebne dla wysyłki / przewoźnika).
  // Optional, bo stare zamówienia w DB go nie mają.
  fullname?: string;
  // Telefon kontaktowy (opcjonalny).
  phone?: string;
};

export type PaymentMethod = "online" | "cod";

export type OrderStatus =
  | "pending"
  | "paid"
  | "processing"
  | "shipped"
  | "delivered"
  | "cancelled";

export type Order = {
  id: string;
  user_id: string | null;
  guest_email: string | null;
  status: OrderStatus;
  total: number;
  currency: "pln" | "eur";
  fx_rate: number | null;
  shipping_address: Address;
  payment_ref: string | null;
  payment_provider: "p24" | null;
  // Metoda płatności (migracja 45): online = płatność elektroniczna (P24),
  // cod = za pobraniem u kuriera.
  payment_method: PaymentMethod;
  promo_code_id: string | null;
  promo_discount: number;
  // Suma rabatów zestawów tego zamówienia, w walucie zamówienia (migracja 55).
  bundle_discount: number;
  created_at: string;
  // Panel admina (migracja 31)
  order_number: number;
  admin_note: string | null;
  carrier: string | null;
  tracking_number: string | null;
  delivery_cost: number | null;
  delivery_paid: boolean;
  status_updated_at: string | null;
  items?: OrderItem[];
  // Dołączane przez query — kod promo z joina. Null jeśli zamówienie bez kuponu
  // albo gdy admin usunął kod (FK ON DELETE SET NULL).
  promo_code?: { code: string } | null;
};

export type OrderItem = {
  id: string;
  order_id: string;
  product_id: string;
  quantity: number;
  price: number;
  variant_values: Record<string, string> | null;
  notes: string | null;
  // Pozycja kupiona w zestawie: id (FK SET NULL) + nazwa z chwili zakupu.
  bundle_id: string | null;
  bundle_label: string | null;
  product?: Product;
};

export type ReviewStatus = "pending" | "approved" | "rejected";

export type ProductReview = {
  id: string;
  product_id: string;
  // null dla opinii gościa — patrz migracja 76 i warunek
  // product_reviews_autor_jeden: wypełnione jest ALBO user_id, ALBO para
  // guest_name+guest_email.
  user_id: string | null;
  guest_name: string | null;
  guest_email: string | null;
  rating: 1 | 2 | 3 | 4 | 5;
  comment: string | null;
  status: ReviewStatus;
  homepage_excluded: boolean;
  created_at: string;
  updated_at: string;
  // Dołączane przez getReviewsForProduct: dla konta z profiles.full_name,
  // dla gościa wprost z guest_name.
  author_name?: string | null;
};

export type ReviewInvite = {
  id: string;
  order_id: string;
  product_id: string;
  email: string;
  token_hash: string;
  sent_at: string;
  reminded_at: string | null;
  used_at: string | null;
  expires_at: string;
};

export type ProductRating = {
  average: number; // 0..5
  count: number;
};

type OrderInsert = {
  user_id?: string | null;
  guest_email?: string | null;
  total: number;
  shipping_address: Address;
  status?: OrderStatus;
  payment_ref?: string | null;
  payment_provider?: "p24" | null;
};

type OrderItemInsert = {
  order_id: string;
  product_id: string;
  quantity: number;
  price: number;
  variant_values?: Record<string, string> | null;
  notes?: string | null;
  bundle_id?: string | null;
  bundle_label?: string | null;
};

export type Database = {
  public: {
    Tables: {
      products: {
        Row: Product;
        Insert: Omit<Product, "id" | "created_at"> & { id?: string; created_at?: string };
        Update: Partial<Omit<Product, "id" | "created_at">>;
        Relationships: [];
      };
      profiles: {
        Row: Profile;
        Insert: Omit<Profile, "created_at"> & { created_at?: string };
        Update: Partial<Omit<Profile, "id" | "created_at">>;
        Relationships: [];
      };
      orders: {
        Row: Omit<Order, "items">;
        Insert: OrderInsert;
        Update: Partial<OrderInsert>;
        Relationships: [];
      };
      order_items: {
        Row: Omit<OrderItem, "product">;
        Insert: OrderItemInsert;
        Update: Partial<OrderItemInsert>;
        Relationships: [];
      };
    };
  };
};

// ============================================================
// Próbki tkanin (migracja 67)
// ============================================================
// UWAGA na kolizję nazw: "próbka" w istniejącym kodzie oznacza ZDJĘCIE wzornika
// (FabricSwatchGrid, fabric-swatch-images.ts). Byty z tej funkcji nazywamy
// konsekwentnie `Sample*` / `sample_*`.

export type SampleOrderStatus = "new" | "packed" | "sent" | "cancelled";
export type SamplePaymentStatus = "none" | "pending" | "paid";

export type SampleOrderItem = {
  id: string;
  sample_order_id: string;
  fabric_id: string | null;
  color: string;
  // Snapshot nazwy tkaniny z chwili zamówienia — katalog może się zmienić.
  fabric_name: string;
  is_free: boolean;
  unit_price: number;
  created_at: string;
};

export type SampleOrder = {
  id: string;
  user_id: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string | null;
  // Partial<Address>, a nie Record<string, string>: Address ma opcjonalne
  // fullname/phone (string | undefined), więc do Record<string, string> się nie
  // przypisze — a adres bierzemy wprost z profiles.address / orders.shipping_address.
  // Partial, bo profil bywa pusty i formularz startuje z niekompletnym adresem.
  shipping_address: Partial<Address>;
  status: SampleOrderStatus;
  // Osobna oś od `status`: "czy zapłacone" nie jest etapem realizacji.
  payment_status: SamplePaymentStatus;
  amount_total: number;
  payment_ref: string | null;
  free_count: number;
  paid_count: number;
  email_key: string;
  tracking: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
};
