import { NextResponse, type NextRequest } from "next/server";
import { registerTransaction, trnRequestUrl, type P24RegisterParams } from "@/app/_lib/p24";
import { createClient } from "@/app/_lib/supabase/server";
import { createOrder } from "@/app/_lib/orders";
import { validatePromoCode, incrementPromoUsage } from "@/app/_lib/promo";
import { isValidCodPhone } from "@/app/_lib/cod";
import {
  hasVariants,
  isVariantSelectionComplete,
  sumValueSurcharges,
} from "@/app/_lib/variants";
import type { Address, Product } from "@/app/_lib/types";
import { getEurRate } from "@/app/_lib/store-settings";
import { convertToEur } from "@/app/_lib/money";
import { effectivePrice } from "@/app/_lib/pricing";

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
  paymentMethod?: "online" | "cod";
};

export async function POST(request: NextRequest) {
  // locale + tr POZA try: blok catch (500) też musi zwrócić komunikat wg języka.
  // body.locale to źródło prawdy — proxy ustawia x-locale z prefiksu URL, a fetch
  // do /api/checkout nie ma prefiksu /de, więc x-locale byłby tu zawsze "pl".
  let locale: "pl" | "de" = "pl";
  const tr = (pl: string, de: string) => (locale === "de" ? de : pl);
  try {
    const body = (await request.json()) as CheckoutBody;
    locale = body.locale === "de" ? "de" : "pl";

    const isDe = locale === "de";
    // Brak pola = "online" — kompatybilnie ze starszym klientem (cache SW itp.).
    const isCod = body.paymentMethod === "cod";
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
    // Adres dostawy wymagany w całości — bez tego zamówienie w systemie powstaje
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

    // Pobranie: kurier musi mieć telefon (i to zapora przed fałszywkami).
    // Walidacja autorytatywna — formularz waliduje tylko dla UX.
    if (isCod && !isValidCodPhone(shippingAddress.phone)) {
      return NextResponse.json(
        {
          error: tr(
            "Przy płatności za pobraniem wymagany jest numer telefonu (7–15 cyfr)",
            "Bei Nachnahme ist eine Telefonnummer erforderlich (7–15 Ziffern)"
          ),
        },
        { status: 400 }
      );
    }

    // Pobierz aktualne ceny + warianty z DB (nie ufaj klientowi)
    const supabase = await createClient();
    const productIds = body.items.map((i) => i.id);
    const { data: products, error: prodErr } = await supabase
      .from("products")
      .select("id, name, price, sale_price, stock, images, variants")
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
      // (service role) zanim cokolwiek zostało zwalidowane.
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

      let unitPrice = effectivePrice(Number(product.price), product.sale_price);
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
        const surcharge = sumValueSurcharges(
          product.variants?.options ?? [],
          item.variantValues
        );
        const regular = Number(product.price) + surcharge;
        const sale =
          product.sale_price != null ? Number(product.sale_price) + surcharge : null;
        unitPrice = effectivePrice(regular, sale);
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
    }

    // Walidacja kodu rabatowego (autorytatywna — klient mógł zmienić cokolwiek).
    // Discount stosujemy do total produktów (przed dostawą). Rabat jest już
    // zawarty w finalTotal — P24 dostaje tylko sumę końcową.
    let promoCodeId: string | null = null;
    let promoDiscount = 0;

    if (body.promoCode) {
      const promoResult = await validatePromoCode(body.promoCode, total, locale);
      if (!promoResult.ok) {
        return NextResponse.json({ error: promoResult.error }, { status: 400 });
      }
      // Rabat wiąże się z zamówieniem tylko gdy realnie obniża kwotę w groszach.
      // Rabat zaokrąglony do 0 gr (np. 1% z 0,49 zł) nie wiąże kodu — inaczej
      // used_count++ za rabat, którego klient nie dostał. Ta sama reguła dla
      // P24 i pobrania (spójność: COD też nie pali użycia kodu za 0,00 zł).
      const amountOffGr = Math.round(toCharge(promoResult.discount) * 100);
      if (amountOffGr > 0) {
        promoCodeId = promoResult.promo.id;
        promoDiscount = promoResult.discount;
      }
    }

    // Wysyłka darmowa na terenie całej Polski — nie doliczamy kosztu dostawy.
    // Do P24 idzie tylko cena produktów (minus rabat). Pola delivery_cost /
    // delivery_price w panelu admina zostają do rozliczeń wewnętrznych.
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
      paymentMethod: isCod ? "cod" : "online",
    });

    const origin =
      request.headers.get("origin") ??
      process.env.NEXT_PUBLIC_APP_URL ??
      "http://localhost:3000";

    // ── Pobranie: bez płatności online. Zamówienie już utworzone (status
    // "processing"), klient płaci kurierowi. Promo inkrementujemy TERAZ —
    // notyfikacja P24 (/api/p24/status) nigdy nie przyjdzie dla COD.
    // Best-effort: used_count to miękka statystyka.
    if (isCod) {
      const localePrefix = isDe ? "/de" : "";
      if (promoCodeId) {
        try {
          await incrementPromoUsage(promoCodeId);
        } catch (err) {
          console.error("[promo] increment used_count (COD) nieudany:", err);
        }
      }
      return NextResponse.json({
        url: `${origin}${localePrefix}/checkout/success?order_id=${order.id}`,
      });
    }

    // Rejestracja transakcji P24
    const token = await registerTransaction(
      buildP24RegisterParams({
        orderId: order.id,
        finalTotal,
        isDe,
        email: body.email,
        origin,
      })
    );

    return NextResponse.json({ url: trnRequestUrl(token) });
  } catch (err) {
    // Szczegóły tylko do logów serwera — surowe err.message wyciekało
    // wewnętrzne detale (Supabase/P24) do klienta.
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

export function buildP24RegisterParams(args: {
  orderId: string;
  finalTotal: number;
  isDe: boolean;
  email: string;
  origin: string;
}): P24RegisterParams {
  const localePrefix = args.isDe ? "/de" : "";
  return {
    sessionId: args.orderId,
    amount: Math.round(args.finalTotal * 100),
    currency: args.isDe ? "EUR" : "PLN",
    description: `Zamówienie ${args.orderId.slice(0, 8).toUpperCase()}`,
    email: args.email,
    country: args.isDe ? "DE" : "PL",
    language: args.isDe ? "de" : "pl",
    urlReturn: `${args.origin}${localePrefix}/checkout/success?order=${args.orderId}`,
    urlStatus: `${args.origin}/api/p24/status`,
  };
}
