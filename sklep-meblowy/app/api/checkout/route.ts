import { NextResponse, type NextRequest } from "next/server";
import { stripe } from "@/app/_lib/stripe";
import { createClient } from "@/app/_lib/supabase/server";
import { createOrder } from "@/app/_lib/orders";
import {
  findVariant,
  formatVariantLabel,
  hasVariants,
  isVariantSelectionComplete,
} from "@/app/_lib/variants";
import type { Address, Product } from "@/app/_lib/types";

type LineItem = NonNullable<
  NonNullable<Parameters<typeof stripe.checkout.sessions.create>[0]>["line_items"]
>[number];

type CheckoutBody = {
  items: {
    id: string;
    name: string;
    price: number;
    quantity: number;
    image?: string;
    variantValues?: Record<string, string>;
  }[];
  email: string;
  fullName: string;
  address: Address;
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as CheckoutBody;

    if (!body.items?.length) {
      return NextResponse.json({ error: "Koszyk jest pusty" }, { status: 400 });
    }
    if (!body.email || !body.fullName) {
      return NextResponse.json(
        { error: "Brak wymaganych danych" },
        { status: 400 }
      );
    }

    // Pobierz aktualne ceny + warianty z DB (nie ufaj klientowi)
    const supabase = await createClient();
    const productIds = body.items.map((i) => i.id);
    const { data: products, error: prodErr } = await supabase
      .from("products")
      .select("id, name, price, stock, images, variants")
      .in("id", productIds);

    if (prodErr || !products) {
      return NextResponse.json(
        { error: "Błąd bazy produktów" },
        { status: 500 }
      );
    }

    const productMap = new Map<string, Product>(
      (products as unknown as Product[]).map((p) => [p.id, p])
    );

    // Walidacja magazynu + ceny serwerowe (cena = bazowa + price_modifier wariantu)
    const orderItems: {
      product_id: string;
      quantity: number;
      price: number;
      variant_values?: Record<string, string> | null;
    }[] = [];
    const stripeLineItems: LineItem[] = [];
    let total = 0;

    for (const item of body.items) {
      const product = productMap.get(item.id);
      if (!product) {
        return NextResponse.json(
          { error: `Produkt ${item.name} niedostępny` },
          { status: 400 }
        );
      }

      let unitPrice = Number(product.price);
      let variantValues: Record<string, string> | null = null;

      // Meble robione na zamówienie — walidujemy tylko kompletność wyboru
      // wariantu (nie stany magazynowe).
      if (hasVariants(product)) {
        if (
          !item.variantValues ||
          !isVariantSelectionComplete(product, item.variantValues)
        ) {
          return NextResponse.json(
            { error: `Brak wyboru wariantu dla: ${product.name}` },
            { status: 400 }
          );
        }
        const variant = findVariant(product, item.variantValues);
        if (!variant) {
          return NextResponse.json(
            { error: `Nieprawidłowy wariant dla: ${product.name}` },
            { status: 400 }
          );
        }
        unitPrice += variant.price_modifier ?? 0;
        variantValues = item.variantValues;
      }

      total += unitPrice * item.quantity;
      orderItems.push({
        product_id: product.id,
        quantity: item.quantity,
        price: unitPrice,
        variant_values: variantValues,
      });

      stripeLineItems.push({
        quantity: item.quantity,
        price_data: {
          currency: "pln",
          unit_amount: Math.round(unitPrice * 100),
          product_data: {
            name:
              product.name +
              (variantValues ? ` — ${formatVariantLabel(variantValues)}` : ""),
            images: product.images?.length ? [product.images[0]] : undefined,
          },
        },
      });
    }

    // Dostawa: darmowa od 2000 zł, inaczej 299 zł
    const shipping = total >= 2000 ? 0 : 299;
    total += shipping;

    if (shipping > 0) {
      stripeLineItems.push({
        quantity: 1,
        price_data: {
          currency: "pln",
          unit_amount: shipping * 100,
          product_data: { name: "Dostawa" },
        },
      });
    }

    // Użytkownik zalogowany?
    const {
      data: { user },
    } = await supabase.auth.getUser();

    // Utwórz wstępne zamówienie (email gościa lowercase — spójne z linkowaniem)
    const order = await createOrder({
      userId: user?.id ?? null,
      guestEmail: user ? null : body.email.trim().toLowerCase(),
      items: orderItems,
      total,
      shippingAddress: body.address,
    });

    // Stripe Checkout Session
    const origin =
      request.headers.get("origin") ??
      process.env.NEXT_PUBLIC_APP_URL ??
      "http://localhost:3000";

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card", "blik", "p24"],
      line_items: stripeLineItems,
      customer_email: body.email,
      success_url: `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/checkout/cancel`,
      metadata: { order_id: order.id },
      locale: "pl",
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("Checkout error:", err);
    const message =
      err instanceof Error
        ? err.message
        : typeof err === "object" && err !== null && "message" in err
          ? String((err as { message: unknown }).message)
          : "Nieznany błąd";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
