// Kategorie są teraz dynamiczne (z DB, edytowane przez admin panel) —
// reprezentujemy slug jako zwykły string. Walidacja istnienia odbywa się
// po stronie DB przez FK products.category → categories.slug.
export type Category = string;

export type ActionResult =
  | { ok: true; message?: string; data?: unknown }
  | { ok: false; error: string };

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
  // Grupa rozmiarów (migracja 35) — łączy osobne produkty tego samego mebla
  // w różnych rozmiarach. size_group: wspólny klucz; size_label: etykieta tego
  // rozmiaru ("140×200 cm"). Selektor rozmiaru na karcie produktu pokazuje
  // rodzeństwo z tym samym size_group. Pass-through PL/DE (brak kolumn _de).
  size_group: string | null;
  size_label: string | null;
  // Omnibus (migracja 36) — poziom produktu (dla produktów bez wariantów).
  sale_price: number | null;
  omnibus_price: number | null;
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
  created_at: string;
  updated_at: string;
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
  stripe_payment_intent: string | null;
  // Metoda płatności (migracja 45): online = Stripe, cod = za pobraniem.
  payment_method: PaymentMethod;
  promo_code_id: string | null;
  promo_discount: number;
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
  product?: Product;
};

export type ProductReview = {
  id: string;
  product_id: string;
  user_id: string;
  rating: 1 | 2 | 3 | 4 | 5;
  comment: string | null;
  created_at: string;
  updated_at: string;
  // Dołączane przez getReviewsForProduct — imię autora z profiles.full_name.
  author_name?: string | null;
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
  stripe_payment_intent?: string | null;
};

type OrderItemInsert = {
  order_id: string;
  product_id: string;
  quantity: number;
  price: number;
  variant_values?: Record<string, string> | null;
  notes?: string | null;
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
