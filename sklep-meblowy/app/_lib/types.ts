// Kategorie są teraz dynamiczne (z DB, edytowane przez admin panel) —
// reprezentujemy slug jako zwykły string. Walidacja istnienia odbywa się
// po stronie DB przez FK products.category → categories.slug.
export type Category = string;

export type ProductDimensions = {
  width: number;
  depth: number;
  height: number;
};

// Definicja typu wariantu (np. "Strona": ["Lewa","Prawa"])
export type ProductOption = {
  name: string;
  values: string[];
};

// Konkretna kombinacja wybranych wartości + stock + ewentualny modyfikator ceny.
// values mapuje nazwę opcji → wybraną wartość, np. {"Strona":"Lewa","Kolor":"Beżowy"}.
// images: opcjonalny zestaw zdjęć dla tej kombinacji — jeśli pusty/null,
// frontend pokazuje globalną galerię produktu (products.images).
export type ProductVariant = {
  values: Record<string, string>;
  stock: number;
  price_modifier?: number;
  images?: string[];
};

// Override-y wyświetlanych nazw — admin może zmienić "Wariant" → "Kolor"
// i "01 beż drewniany stelaż" → "Beż drewniany". Zapisane oddzielnie żeby
// sync z BL nie nadpisał ich (BL przy każdym sync zwraca surowe nazwy).
export type ProductVariantOverrides = {
  // np. {"Wariant": "Kolor"}
  option_names?: Record<string, string>;
  // np. {"Wariant": {"01 beż drewniany stelaż": "Beż drewniany"}}
  value_labels?: Record<string, Record<string, string>>;
};

export type ProductVariants = {
  options: ProductOption[];
  combinations: ProductVariant[];
  overrides?: ProductVariantOverrides;
};

// Cecha produktu z BL — wszystko co admin wrzuca w "Cechy produktu" w BL
// trafia tutaj jako para {key, value}. Array (nie obiekt) żeby zachować
// kolejność z BL — admin może świadomie ustawić kolejność wyświetlania.
export type ProductFeature = {
  key: string;
  value: string;
};

// Sekcja opisu produktu — IKEA-style akordeony na karcie produktu.
// Discriminated union: text (treść z BL) lub image (wstawione przez admina).
// Text sekcje wypełnia automatycznie sync BL z pól text_fields wg
// DESCRIPTION_SECTION_LABELS (3 sekcje: Opis / Wymiary i materiały /
// Informacje dla klienta). Image sekcje dodaje admin w /admin/produkty/[id].
// Sync NIE nadpisuje image sekcji ani admin overrides — BL jest źródłem
// prawdy dla title/body, admin może override per produkt gdy koleżanka
// pomyliła pola w BL.
export type ProductDescriptionSectionText = {
  kind: "text";
  // title + body z BL sync (mapowanie pól w baselinker-sync.ts) ALBO
  // wpisane przez admina (gdy admin_custom=true).
  title: string;
  body: string;
  // Per-product admin overrides — przeżywają sync z BL przez
  // mergeSectionsPreserveAdminImages (match po `title`).
  // Render w sklepie: admin_title || title, admin_body || body.
  // hidden=true → sekcja ukryta przed klientem.
  // Override-y mają sens tylko dla sekcji z BL — dla admin_custom
  // sekcji edytujemy bezpośrednio title/body.
  admin_title?: string;
  admin_body?: string;
  hidden?: boolean;
  // Sekcja dodana przez admina (NIE pochodzi z BL). Merge logic NIE
  // próbuje match-ować jej do żadnego pola BL — istnieje niezależnie,
  // przeżywa sync analogicznie do image sekcji. Title/body są edytowalne
  // bezpośrednio (nie przez admin_title/admin_body), bo nie ma "BL truth"
  // do nadpisania.
  admin_custom?: boolean;
};

export type ProductDescriptionSectionImage = {
  kind: "image";
  image_url: string;
  image_alt: string;
  caption?: string;
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
  // Pełen zestaw cech z BL — duplikuje też te które mają dedykowane
  // kolumny (kolor, materiał itd.) dla wygody wyświetlania. Pusta tablica
  // gdy produkt nie ma żadnych cech w BL.
  features: ProductFeature[];
  // Sekcje opisu (IKEA-style akordeony). Wypełniane przez sync z 5 pól BL.
  // Pusta tablica gdy BL nie ma description + extras.
  description_sections: ProductDescriptionSection[];
  variants: ProductVariants | null;
  baselinker_id: string | null;
  collection_id: string | null;
  // Widoczność w sklepie (RLS). false = ukryty. deactivation_source: kto ukrył.
  is_active: boolean;
  deactivation_source: "auto" | "manual" | null;
  created_at: string;
};

export type Collection = {
  id: string;
  slug: string;
  label: string;
  description: string | null;
  created_at: string;
  updated_at: string;
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
  // Imię i nazwisko adresata (potrzebne dla BaseLinker / kuriera).
  // Optional, bo stare zamówienia w DB go nie mają.
  fullname?: string;
  // Telefon kontaktowy (opcjonalny).
  phone?: string;
};

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
  shipping_address: Address;
  stripe_payment_intent: string | null;
  promo_code_id: string | null;
  promo_discount: number;
  created_at: string;
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
