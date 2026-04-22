// Eksportowane z _lib/categories.ts — single source of truth.
import type { CategorySlug } from "./categories";
export type Category = CategorySlug;

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
export type ProductVariant = {
  values: Record<string, string>;
  stock: number;
  price_modifier?: number;
};

export type ProductVariants = {
  options: ProductOption[];
  combinations: ProductVariant[];
};

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
  variants: ProductVariants | null;
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
  created_at: string;
  items?: OrderItem[];
};

export type OrderItem = {
  id: string;
  order_id: string;
  product_id: string;
  quantity: number;
  price: number;
  variant_values: Record<string, string> | null;
  product?: Product;
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
