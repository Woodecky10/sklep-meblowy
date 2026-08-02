// Czysta logika ekranu /admin/probki: do której grupy trafia zamówienie, które
// przyciski wolno przy nim pokazać, jak brzmi ostrzeżenie przed anulowaniem
// i jak wygląda adres gotowy do skopiowania na kopertę.
//
// Osobny, bezserwerowy plik z dwóch powodów: komponent kliencki może go
// zaimportować bez ciągnięcia `server-only`, a reguły pilnujące pieniędzy
// i darmowej puli dają się przetestować bez bazy.

import { formatPrice } from "@/app/_lib/format";
import { pluralForm } from "@/app/_lib/plural";
import type {
  SampleOrder,
  SampleOrderItem,
  SampleOrderStatus,
  SamplePaymentStatus,
} from "@/app/_lib/types";

// Ten sam kształt, co `SampleOrderWithItems` z app/_lib/samples.ts. Powtórzony
// tutaj świadomie: tamten moduł jest `server-only`, a ten ląduje w bundlu
// klienta. Strukturalnie identyczne, więc strona przekazuje dane bez konwersji.
export type SampleOrderRow = SampleOrder & { items: SampleOrderItem[] };

export type SampleGroupKey =
  | "refund"
  | "toPack"
  | "packed"
  | "unpaid"
  | "sent"
  | "cancelled";

// Kolejność sekcji na stronie. „refund" jest PIERWSZY i celowo nie da się go
// zwinąć — patrz komentarz w sampleGroupOf.
export const SAMPLE_GROUP_ORDER: SampleGroupKey[] = [
  "refund",
  "toPack",
  "packed",
  "unpaid",
  "sent",
  "cancelled",
];

export type SampleGroupMeta = {
  title: string;
  // Zdanie pod nagłówkiem — mówi właścicielce, co ma z tą grupą zrobić.
  note: string;
  // Sekcja domyślnie zwinięta (tylko historia, nie praca do zrobienia).
  collapsed?: boolean;
  // Wyróżnienie wizualne: "alert" = czerwona ramka, "warn" = bursztynowa.
  tone?: "alert" | "warn";
};

export const SAMPLE_GROUPS: Record<SampleGroupKey, SampleGroupMeta> = {
  refund: {
    title: "Do zwrotu pieniędzy",
    note:
      "Zamówienie jest anulowane, ale klient zdążył zapłacić — te pieniądze leżą u nas. " +
      "Zwrot robi się ręcznie w panelu Przelewy24, po numerze transakcji poniżej.",
    tone: "alert",
  },
  toPack: {
    title: "Do spakowania",
    note: "Opłacone albo darmowe — można wycinać próbki i pakować kopertę.",
  },
  packed: {
    title: "Spakowane — do wysłania",
    note: "Koperta gotowa. Po nadaniu wpisz numer nadania (jeśli jest) i kliknij „Wysłane”.",
  },
  unpaid: {
    title: "Nieopłacone",
    note:
      "Klient zaczął płatność i jej nie dokończył. Nie pakuj tych zamówień. " +
      "Gdy płatność dojdzie, zamówienie samo przeskoczy do „Do spakowania”.",
    tone: "warn",
  },
  sent: {
    title: "Wysłane",
    note: "Załatwione — zostają dla historii.",
  },
  cancelled: {
    title: "Anulowane",
    note:
      "Historia. Anulowane zamówienia, za które klient nie zapłacił — " +
      "opłacone są wyżej, w sekcji „Do zwrotu pieniędzy”.",
    collapsed: true,
  },
};

export const SAMPLE_STATUS_LABELS: Record<SampleOrderStatus, string> = {
  new: "Nowe",
  packed: "Spakowane",
  sent: "Wysłane",
  cancelled: "Anulowane",
};

export const SAMPLE_PAYMENT_LABELS: Record<SamplePaymentStatus, string> = {
  none: "Bez opłaty",
  pending: "Czeka na płatność",
  paid: "Opłacone",
};

// Do której sekcji trafia zamówienie. Każde zamówienie trafia do DOKŁADNIE
// jednej — kolejność sprawdzeń jest tu treścią, nie stylem.
export function sampleGroupOf(order: SampleOrderRow): SampleGroupKey {
  if (order.status === "cancelled") {
    // ⚠️ ANULOWANE + OPŁACONE = pieniądze klienta leżą u nas. Handler notyfikacji
    // P24 świadomie rozlicza także anulowane zamówienia (inaczej przepadłby
    // `payment_ref`, jedyny trwały ślad numeru transakcji). Poza panelem nie ma
    // o tym ANI JEDNEGO sygnału — poza linią w logach Vercela, do których
    // właścicielka nigdy nie zajrzy. Dlatego osobna sekcja na samej górze,
    // a nie wpis w zwiniętej liście anulowanych.
    return order.payment_status === "paid" ? "refund" : "cancelled";
  }
  // Wysłane sprawdzamy PRZED płatnością: paczka fizycznie poszła, więc nawet
  // brakująca wpłata nie robi z tego „nieopłaconego do obsługi" — trafiłaby
  // między zamówienia czekające na pakowanie i zniknęłaby z historii wysyłek.
  if (order.status === "sent") return "sent";
  if (order.payment_status === "pending") return "unpaid";
  return order.status === "packed" ? "packed" : "toPack";
}

export function groupSampleOrders(
  orders: SampleOrderRow[]
): Record<SampleGroupKey, SampleOrderRow[]> {
  const out: Record<SampleGroupKey, SampleOrderRow[]> = {
    refund: [],
    toPack: [],
    packed: [],
    unpaid: [],
    sent: [],
    cancelled: [],
  };
  // Kolejność wejściowa (created_at malejąco z warstwy danych) zostaje zachowana.
  for (const order of orders) out[sampleGroupOf(order)].push(order);
  return out;
}

export type SampleActions = {
  canPack: boolean;
  canSend: boolean;
  canCancel: boolean;
};

export function sampleActionsFor(order: SampleOrderRow): SampleActions {
  // ⚠️ ANULOWANE TO KONIEC DROGI — żadnych przycisków zmiany statusu.
  // `setSampleOrderStatus` pilnuje tylko powtórzenia tego samego statusu (CAS),
  // więc umie przestawić „cancelled" z powrotem
  // na „new"/„packed", a kolejne „Anuluj" zwolniłoby darmową pulę
  // DRUGI raz (klient dostałby sześć gratisów zamiast trzech). Panel nie może
  // takiego przejścia w ogóle oferować.
  if (order.status === "cancelled") {
    return { canPack: false, canSend: false, canCancel: false };
  }

  // Zamówienie bez ani jednej pozycji — nie wiadomo, co włożyć do koperty
  // (skrajny przypadek: nieudane skasowanie osieroconego zamówienia
  // w createSampleOrder). Zostaje wyłącznie anulowanie.
  const hasItems = order.items.length > 0;
  // Nieopłaconego nie pakujemy: to strata wycinków i przesyłki za zamówienie,
  // za które nikt nie zapłacił. Anulować wolno zawsze — to jedyny sposób,
  // żeby porzucone zamówienie oddało klientowi darmową pulę.
  const settled = order.payment_status !== "pending";

  // Wysłane: nic już nie pakujemy ani nie wysyłamy drugi raz. „Anuluj" zostaje,
  // bo właścicielka może chcieć zamknąć sprawę (pula wtedy NIE wraca).
  if (order.status === "sent") {
    return { canPack: false, canSend: false, canCancel: true };
  }

  return {
    canPack: hasItems && settled && order.status === "new",
    canSend: hasItems && settled,
    canCancel: true,
  };
}

// Czego anulowanie NIE zrobi — pisane wprost, bo to jedyny moment, w którym
// właścicielka może się jeszcze wycofać.
export function cancelSampleWarnings(order: SampleOrderRow): string[] {
  const out: string[] = [];
  if (order.payment_status === "paid") {
    out.push(
      `Klient zapłacił ${formatPrice(order.amount_total, "pl")}. ` +
        "Anulowanie NIE zwraca pieniędzy — zwrot trzeba zrobić ręcznie w panelu Przelewy24."
    );
  }
  if (order.status === "sent") {
    out.push(
      "Zamówienie jest już wysłane — darmowe próbki NIE wracają do puli klienta " +
        "(wycinki fizycznie poszły pocztą)."
    );
  } else if (order.free_count > 0) {
    const word = pluralForm(order.free_count, {
      one: "darmową próbkę",
      few: "darmowe próbki",
      many: "darmowych próbek",
    });
    out.push(`Klient odzyska ${order.free_count} ${word} — wrócą do jego puli.`);
  }
  return out;
}

export function cancelSampleConfirmMessage(order: SampleOrderRow): string {
  const who = order.customer_name.trim() || order.customer_email;
  return [`Anulować zamówienie próbek — ${who}?`, ...cancelSampleWarnings(order)].join("\n\n");
}

// Adres w jednym kawałku, gotowy do wklejenia na kopertę / do etykiety.
export function sampleAddressLines(order: SampleOrderRow): string[] {
  const a = order.shipping_address ?? {};
  const lines: string[] = [];

  const name = (a.fullname ?? "").trim() || order.customer_name.trim();
  if (name) lines.push(name);

  const street = (a.street ?? "").trim();
  if (street) lines.push(street);

  const cityLine = [(a.postal_code ?? "").trim(), (a.city ?? "").trim()]
    .filter(Boolean)
    .join(" ");
  if (cityLine) lines.push(cityLine);

  // Kraj tylko wtedy, gdy to NIE Polska — na krajowej kopercie „Polska" jest
  // szumem, a przy zagranicznym adresie brak kraju to niedostarczona paczka.
  const country = (a.country ?? "").trim();
  if (country && !/^(pl|polska|poland)$/i.test(country)) lines.push(country);

  const phone = (order.customer_phone ?? a.phone ?? "").trim();
  if (phone) lines.push(`tel. ${phone}`);

  return lines;
}

export function formatSampleAddress(order: SampleOrderRow): string {
  return sampleAddressLines(order).join("\n");
}

// Czego w adresie brakuje. Formularz na /probki wymaga ulicy, kodu i miasta,
// więc pusto tu bywa tylko po ręcznej zmianie w bazie — ale wtedy koperta idzie
// donikąd i właścicielka musi to zobaczyć, zanim spakuje próbki.
export function sampleAddressMissing(order: SampleOrderRow): string[] {
  const a = order.shipping_address ?? {};
  const missing: string[] = [];
  if (!(a.street ?? "").trim()) missing.push("ulicy");
  if (!(a.postal_code ?? "").trim()) missing.push("kodu pocztowego");
  if (!(a.city ?? "").trim()) missing.push("miasta");
  return missing;
}

// Klucz do mapy zdjęć wzornika (buildFabricImageMap: „Nazwa Numer").
// `fabric_name` w pozycji zamówienia to snapshot z chwili zamówienia — jeśli
// tkanina zmieniła nazwę albo zniknęła z katalogu, miniatury po prostu nie ma.
export function sampleImageKey(
  item: Pick<SampleOrderItem, "fabric_name" | "color">
): string {
  return `${item.fabric_name.trim()} ${item.color}`;
}
