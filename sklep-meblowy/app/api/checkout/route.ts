import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/app/_lib/stripe";
import { createClient } from "@/app/_lib/supabase/server";
import { createOrder } from "@/app/_lib/orders";
import { validatePromoCode } from "@/app/_lib/promo";
import {
  findVariant,
  formatVariantLabel,
  hasVariants,
  isVariantSelectionComplete,
} from "@/app/_lib/variants";
import type { Address, Product } from "@/app/_lib/types";
import { getEurRate } from "@/app/_lib/store-settings";
import { convertToEur } from "@/app/_lib/money";

// stripe v22 re-eksportuje SessionCreateParams jako alias typu (bez
// wewnętrznego namespace), więc .LineItem nie istnieje — indeksujemy typ.
type LineItem = NonNullable<
  Stripe.Checkout.SessionCreateParams["line_items"]
>[number];

type CheckoutBody = {
  items: {
    id: string;
    name: string;
    price: number;
    quantity: number;
    image?: string;
    variantValues?: Record<string, string>;
    notes?: string;
  }[];
  email: string;
  fullName: string;
  address: Address;
  promoCode?: string | null;
  locale?: "pl" | "de";
};

export async function POST(request: NextRequest) {
  // locale + tr POZA try: blok catch (500) też musi zwrócić komunikat wg języka.
  // body.locale to źródło prawdy — proxy ustawia x-locale z prefiksu URL, a fetch
  // do /api/checkout nie ma prefiksu /de, więc x-locale byłby tu zawsze "pl".
  let locale: "pl" | "de" = "pl";
  const tr = (pl: string, de: string) => (locale === "de" ? de : pl);
  try {
    const stripe = getStripe();
    const body = (await request.json()) as CheckoutBody;
    locale = body.locale === "de" ? "de" : "pl";

    const isDe = locale === "de";
    const rate = isDe ? await getEurRate() : 1;
    const currency: "pln" | "eur" = isDe ? "eur" : "pln";
    const toCharge = (pln: number) => (isDe ? convertToEur(pln, rate) : pln);

    if (!body.items?.length) {
      return NextResponse.json(
        { error: tr("Koszyk jest pusty", "Ihr Warenkorb ist leer") },
        { status: 400 }
      );
    }
    if (!body.email || !body.fullName) {
      return NextResponse.json(
        { error: tr("Brak wymaganych danych", "Fehlende Pflichtangaben") },
        { status: 400 }
      );
    }
    // Walidacja formatu/długości emaila — bez tego śmieciowy guest_email
    // tworzył osierocone pending-zamówienia w DB (audyt 2026-06-11 LOW).
    const emailTrimmed = body.email.trim();
    if (
      emailTrimmed.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrimmed)
    ) {
      return NextResponse.json(
        { error: tr("Nieprawidłowy adres e-mail", "Ungültige E-Mail-Adresse") },
        { status: 400 }
      );
    }
    // Adres dostawy wymagany w całości — bez tego zamówienie w BL powstaje
    // bez adresu i kurier nie ma gdzie jechać. Formularz to waliduje, ale
    // route musi być odporny na bezpośrednie wywołania.
    const shippingAddress = body.address;
    if (
      !shippingAddress?.street?.trim() ||
      !shippingAddress?.postal_code?.trim() ||
      !shippingAddress?.city?.trim()
    ) {
      return NextResponse.json(
        { error: tr("Brak pełnego adresu dostawy", "Unvollständige Lieferadresse") },
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
        { error: tr("Błąd bazy produktów", "Fehler in der Produktdatenbank") },
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
      notes?: string | null;
    }[] = [];
    const stripeLineItems: LineItem[] = [];
    let total = 0;

    for (const item of body.items) {
      const product = productMap.get(item.id);
      if (!product) {
        return NextResponse.json(
          {
            error: tr(
              `Produkt ${item.name} niedostępny`,
              `Produkt ${item.name} nicht verfügbar`
            ),
          },
          { status: 400 }
        );
      }

      // Ilość z klienta — twarda walidacja (int 1..99). Bez tego ujemne /
      // ułamkowe / absurdalne ilości tworzyły zamówienia-śmieci w DB
      // (service role) zanim Stripe cokolwiek zwalidował.
      if (
        !Number.isInteger(item.quantity) ||
        item.quantity < 1 ||
        item.quantity > 99
      ) {
        return NextResponse.json(
          {
            error: tr(
              `Nieprawidłowa ilość dla: ${product.name}`,
              `Ungültige Menge für: ${product.name}`
            ),
          },
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
            {
              error: tr(
                `Brak wyboru wariantu dla: ${product.name}`,
                `Keine Variante ausgewählt für: ${product.name}`
              ),
            },
            { status: 400 }
          );
        }
        const variant = findVariant(product, item.variantValues);
        if (!variant) {
          return NextResponse.json(
            {
              error: tr(
                `Nieprawidłowy wariant dla: ${product.name}`,
                `Ungültige Variante für: ${product.name}`
              ),
            },
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
        notes: item.notes?.trim() ? item.notes.trim().slice(0, 500) : null,
      });

      stripeLineItems.push({
        quantity: item.quantity,
        price_data: {
          currency,
          unit_amount: Math.round(toCharge(unitPrice) * 100),
          product_data: {
            name:
              product.name +
              (variantValues ? ` — ${formatVariantLabel(variantValues)}` : ""),
            images: product.images?.length ? [product.images[0]] : undefined,
          },
        },
      });
    }

    // Walidacja kodu rabatowego (autorytatywna — klient mógł zmienić cokolwiek).
    // Discount stosujemy do total produktów (przed dostawą). Stripe dostaje
    // dynamicznie utworzony Coupon zamiast modyfikacji line_items.
    let promoCodeId: string | null = null;
    let promoDiscount = 0;
    let stripeCouponId: string | null = null;

    if (body.promoCode) {
      const promoResult = await validatePromoCode(body.promoCode, total, locale);
      if (!promoResult.ok) {
        return NextResponse.json({ error: promoResult.error }, { status: 400 });
      }
      promoCodeId = promoResult.promo.id;
      promoDiscount = promoResult.discount;

      // Stripe Coupon (one-shot, dla tej sesji). Zawsze amount_off (kwotowo,
      // w groszach) — także dla kuponów procentowych. percent_off liczyłby
      // Stripe po swojemu (własne zaokrąglenia), a rabat w BL (ujemna
      // pozycja K1) i orders.promo_discount używają NASZEJ kwoty z
      // validatePromoCode — jedna kwota wszędzie eliminuje rozjazd o grosz
      // między kwotą pobraną a sumą pozycji w BL.
      // amount_off=0 jest błędem w Stripe (np. 1% z 0,49 zł zaokrągla się
      // do 0 gr) — wtedy po prostu nie tworzymy kuponu.
      const amountOffGr = Math.round(toCharge(promoDiscount) * 100);
      if (amountOffGr > 0) {
        const coupon = await stripe.coupons.create({
          amount_off: amountOffGr,
          currency,
          duration: "once",
          name: promoResult.promo.code,
        });
        stripeCouponId = coupon.id;
      } else {
        // Rabat zaokrąglił się do 0 gr (np. 1% z 0,49 zł). Nie tworzymy kuponu
        // Stripe ANI nie wiążemy zamówienia z kodem — inaczej webhook spaliłby
        // użycie kodu (used_count++) za rabat, którego klient nie dostał.
        promoDiscount = 0;
        promoCodeId = null;
      }
    }

    // Koszt dostawy NIE jest doliczany do Stripe — meble różnią się wagą
    // i gabarytami. Po zamówieniu admin kontaktuje klienta i ustala koszt
    // dostawy indywidualnie (płatność osobno: przelew albo doliczone do BL
    // jako delivery_price).
    const finalTotal = toCharge(Math.max(0, total - promoDiscount));

    // Użytkownik zalogowany?
    const {
      data: { user },
    } = await supabase.auth.getUser();

    // Utwórz wstępne zamówienie (email gościa lowercase — spójne z linkowaniem)
    const order = await createOrder({
      userId: user?.id ?? null,
      guestEmail: user ? null : body.email.trim().toLowerCase(),
      items: orderItems.map((it) => ({ ...it, price: toCharge(it.price) })),
      total: finalTotal,
      shippingAddress: body.address,
      promoCodeId,
      promoDiscount: toCharge(promoDiscount),
      currency,
      fxRate: isDe ? rate : null,
    });

    // Stripe Checkout Session
    const origin =
      request.headers.get("origin") ??
      process.env.NEXT_PUBLIC_APP_URL ??
      "http://localhost:3000";

    // Prefiks języka dla URL-i powrotnych — strony /checkout/* żyją pod /de/*
    // dla locale "de" (proxy przepisuje /de/* na /*). Dla "pl" zostaje pusty,
    // więc URL pozostaje oryginalny.
    const localePrefix = locale === "de" ? "/de" : "";

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: isDe ? ["card", "p24"] : ["card", "blik", "p24"],
      line_items: stripeLineItems,
      customer_email: body.email,
      success_url: `${origin}${localePrefix}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}${localePrefix}/checkout/cancel`,
      metadata: { order_id: order.id },
      locale: isDe ? "de" : "pl",
      ...(stripeCouponId
        ? { discounts: [{ coupon: stripeCouponId }] }
        : {}),
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    // Szczegóły tylko do logów serwera — surowe err.message wyciekało
    // wewnętrzne detale (Stripe/Supabase) do klienta.
    console.error("Checkout error:", err);
    return NextResponse.json(
      {
        error: tr(
          "Nie udało się rozpocząć płatności. Spróbuj ponownie za chwilę.",
          "Die Zahlung konnte nicht gestartet werden. Bitte versuchen Sie es in Kürze erneut."
        ),
      },
      { status: 500 }
    );
  }
}
