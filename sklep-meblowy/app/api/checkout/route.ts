import { NextResponse, type NextRequest } from "next/server";
import { stripe } from "@/app/_lib/stripe";
import { createClient } from "@/app/_lib/supabase/server";
import { createOrder } from "@/app/_lib/orders";
import type { Address } from "@/app/_lib/types";

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
    variant?: string;
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

    // Pobierz aktualne ceny z DB (nie ufaj klientowi)
    const supabase = await createClient();
    const productIds = body.items.map((i) => i.id);
    const { data: products, error: prodErr } = await supabase
      .from("products")
      .select("id, name, price, stock, images")
      .in("id", productIds);

    if (prodErr || !products) {
      return NextResponse.json(
        { error: "Błąd bazy produktów" },
        { status: 500 }
      );
    }

    type ProductRow = {
      id: string;
      name: string;
      price: number;
      stock: number;
      images: string[];
    };
    const productMap = new Map<string, ProductRow>(
      (products as ProductRow[]).map((p) => [p.id, p])
    );

    // Walidacja magazynu + ceny serwerowe
    const orderItems: {
      product_id: string;
      quantity: number;
      price: number;
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
      if (product.stock < item.quantity) {
        return NextResponse.json(
          { error: `Brak wystarczającej ilości: ${product.name}` },
          { status: 400 }
        );
      }

      const price = Number(product.price);
      total += price * item.quantity;
      orderItems.push({
        product_id: product.id,
        quantity: item.quantity,
        price,
      });

      stripeLineItems.push({
        quantity: item.quantity,
        price_data: {
          currency: "pln",
          unit_amount: Math.round(price * 100),
          product_data: {
            name: product.name + (item.variant ? ` — ${item.variant}` : ""),
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

    // Utwórz wstępne zamówienie
    const order = await createOrder({
      userId: user?.id ?? null,
      guestEmail: user ? null : body.email,
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
