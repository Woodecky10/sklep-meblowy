import { describe, it, expect } from "vitest";

// Testy czystej logiki listy /admin/probki. Sprawdzamy to, czego właścicielka
// nie ma jak zweryfikować sama: gdzie ląduje zamówienie, których przycisków
// NIE WOLNO pokazać (bo zwolniłyby darmową pulę drugi raz) i czy adres da się
// wkleić na kopertę.

import { buildFabricImageMap } from "@/app/_lib/variants";
import {
  cancelSampleConfirmMessage,
  cancelSampleWarnings,
  formatSampleAddress,
  groupSampleOrders,
  sampleActionsFor,
  sampleAddressMissing,
  sampleGroupOf,
  sampleImageKey,
  type SampleOrderRow,
} from "../sample-groups";

function item(overrides: Partial<SampleOrderRow["items"][number]> = {}) {
  return {
    id: "item-1",
    sample_order_id: "ord-1",
    fabric_id: "fab-1",
    color: "16",
    fabric_name: "Riviera",
    is_free: true,
    unit_price: 0,
    created_at: "2026-08-01T10:00:00Z",
    ...overrides,
  };
}

function order(overrides: Partial<SampleOrderRow> = {}): SampleOrderRow {
  return {
    id: "ord-1",
    user_id: "user-1",
    customer_name: "Jan Kowalski",
    customer_email: "jan@example.com",
    customer_phone: "600100200",
    shipping_address: {
      street: "Testowa 1",
      postal_code: "00-001",
      city: "Warszawa",
      country: "PL",
    },
    status: "new",
    payment_status: "none",
    amount_total: 0,
    payment_ref: null,
    free_count: 3,
    paid_count: 0,
    email_key: "jan@example.com",
    tracking: null,
    sent_at: null,
    created_at: "2026-08-01T10:00:00Z",
    updated_at: "2026-08-01T10:00:00Z",
    items: [item()],
    ...overrides,
  };
}

describe("sampleGroupOf", () => {
  it("anulowane + opłacone idzie do DO ZWROTU, nie do zwiniętej historii", () => {
    // ⚠️ To jedyne miejsce w całym systemie, po którym widać, że u nas leżą
    // cudze pieniądze — poza linią w logach Vercela.
    expect(
      sampleGroupOf(order({ status: "cancelled", payment_status: "paid", amount_total: 15 }))
    ).toBe("refund");
  });

  it("anulowane bez wpłaty to zwykła historia", () => {
    expect(sampleGroupOf(order({ status: "cancelled", payment_status: "pending" }))).toBe(
      "cancelled"
    );
    expect(sampleGroupOf(order({ status: "cancelled", payment_status: "none" }))).toBe(
      "cancelled"
    );
  });

  it("wysłane zostaje wysłane, nawet jeśli wpłata nigdy nie doszła", () => {
    // Paczka fizycznie poszła — między zamówieniami „do obsługi" byłaby myląca.
    expect(sampleGroupOf(order({ status: "sent", payment_status: "pending" }))).toBe("sent");
  });

  it("czekające na wpłatę nie miesza się z gotowymi do spakowania", () => {
    expect(sampleGroupOf(order({ status: "new", payment_status: "pending" }))).toBe("unpaid");
  });

  it("darmowe i opłacone czekają na spakowanie, spakowane mają własną grupę", () => {
    expect(sampleGroupOf(order({ status: "new", payment_status: "none" }))).toBe("toPack");
    expect(sampleGroupOf(order({ status: "new", payment_status: "paid" }))).toBe("toPack");
    // Bez tej grupy zamówienie po kliknięciu „Spakowane" zniknęłoby z ekranu.
    expect(sampleGroupOf(order({ status: "packed", payment_status: "paid" }))).toBe("packed");
  });
});

describe("groupSampleOrders", () => {
  it("każde zamówienie trafia dokładnie raz i zachowuje kolejność wejścia", () => {
    const a = order({ id: "a", status: "new", payment_status: "paid" });
    const b = order({ id: "b", status: "new", payment_status: "paid" });
    const c = order({ id: "c", status: "sent" });
    const groups = groupSampleOrders([a, b, c]);

    expect(groups.toPack.map((o) => o.id)).toEqual(["a", "b"]);
    expect(groups.sent.map((o) => o.id)).toEqual(["c"]);
    const total = Object.values(groups).reduce((n, list) => n + list.length, 0);
    expect(total).toBe(3);
  });
});

describe("sampleActionsFor", () => {
  it("anulowanego nie da się wskrzesić — zero przycisków zmiany statusu", () => {
    // ⚠️ setSampleOrderStatus jest bezwarunkowe: przestawiłoby „cancelled"
    // z powrotem na „packed", a kolejne „Anuluj" zwolniłoby darmową pulę DRUGI
    // raz (sześć gratisów zamiast trzech).
    expect(sampleActionsFor(order({ status: "cancelled", payment_status: "paid" }))).toEqual({
      canPack: false,
      canSend: false,
      canCancel: false,
    });
  });

  it("nieopłaconego nie da się spakować ani wysłać, ale wolno anulować", () => {
    expect(sampleActionsFor(order({ status: "new", payment_status: "pending" }))).toEqual({
      canPack: false,
      canSend: false,
      canCancel: true,
    });
  });

  it("zamówienia bez pozycji nie da się spakować (nie wiadomo, co wysłać)", () => {
    expect(
      sampleActionsFor(order({ status: "new", payment_status: "paid", items: [] }))
    ).toEqual({ canPack: false, canSend: false, canCancel: true });
  });

  it("nowe opłacone można spakować i wysłać, spakowanego już nie pakujemy drugi raz", () => {
    expect(sampleActionsFor(order({ status: "new", payment_status: "paid" }))).toEqual({
      canPack: true,
      canSend: true,
      canCancel: true,
    });
    expect(sampleActionsFor(order({ status: "packed", payment_status: "paid" }))).toEqual({
      canPack: false,
      canSend: true,
      canCancel: true,
    });
  });

  it("wysłanego nie wysyłamy drugi raz — zostaje samo anulowanie", () => {
    expect(sampleActionsFor(order({ status: "sent", payment_status: "paid" }))).toEqual({
      canPack: false,
      canSend: false,
      canCancel: true,
    });
  });
});

describe("cancelSampleWarnings", () => {
  it("przy opłaconym mówi wprost, że pieniądze NIE wracają same", () => {
    const w = cancelSampleWarnings(
      order({ status: "new", payment_status: "paid", amount_total: 30 })
    );
    expect(w.join(" ")).toContain("NIE zwraca pieniędzy");
    expect(w.join(" ")).toContain("Przelewy24");
    expect(w.join(" ")).toContain("30 zł");
  });

  it("przy wysłanym mówi, że darmowe próbki NIE wracają do puli", () => {
    const w = cancelSampleWarnings(order({ status: "sent", free_count: 3 }));
    expect(w.join(" ")).toContain("NIE wracają do puli");
    // I nie obiecuje jednocześnie zwrotu gratisów.
    expect(w.join(" ")).not.toContain("odzyska");
  });

  it("przed wysyłką obiecuje zwrot gratisów tylko wtedy, gdy jakieś były", () => {
    expect(cancelSampleWarnings(order({ free_count: 2 })).join(" ")).toContain("odzyska 2");
    expect(cancelSampleWarnings(order({ free_count: 0 })).join(" ")).not.toContain("odzyska");
  });

  it("pytanie w oknie potwierdzenia niesie imię klienta i ostrzeżenia", () => {
    const msg = cancelSampleConfirmMessage(
      order({ status: "sent", payment_status: "paid", amount_total: 15 })
    );
    expect(msg).toContain("Jan Kowalski");
    expect(msg).toContain("Przelewy24");
    expect(msg).toContain("NIE wracają do puli");
  });
});

describe("adres do skopiowania", () => {
  it("składa etykietę: nazwisko, ulica, kod i miasto, telefon", () => {
    expect(formatSampleAddress(order())).toBe(
      "Jan Kowalski\nTestowa 1\n00-001 Warszawa\ntel. 600100200"
    );
  });

  it("nazwisko z adresu ma pierwszeństwo przed nazwą konta", () => {
    const out = formatSampleAddress(
      order({ shipping_address: { fullname: "Anna Nowak", street: "Inna 2", city: "Gdańsk" } })
    );
    expect(out.startsWith("Anna Nowak")).toBe(true);
  });

  it("Polski nie wypisuje, zagraniczny kraj tak (inaczej paczka nie dojdzie)", () => {
    expect(formatSampleAddress(order())).not.toContain("PL");
    const de = formatSampleAddress(
      order({
        shipping_address: { street: "Hauptstr. 1", postal_code: "10115", city: "Berlin", country: "DE" },
      })
    );
    expect(de).toContain("DE");
  });

  it("pomija puste pola zamiast zostawiać puste linie", () => {
    const out = formatSampleAddress(
      order({ customer_phone: null, shipping_address: { street: "Testowa 1", city: "Łódź" } })
    );
    expect(out).toBe("Jan Kowalski\nTestowa 1\nŁódź");
  });

  it("wskazuje, czego w adresie brakuje", () => {
    expect(sampleAddressMissing(order())).toEqual([]);
    expect(sampleAddressMissing(order({ shipping_address: { city: "Łódź" } }))).toEqual([
      "ulicy",
      "kodu pocztowego",
    ]);
  });
});

describe("sampleImageKey", () => {
  it("trafia w klucz mapy zdjęć wzornika", () => {
    // Kontrakt między snapshotem pozycji zamówienia a buildFabricImageMap —
    // rozjazd oznacza listę bez miniatur, czyli wycinanie kolorów po nazwie.
    const map = buildFabricImageMap([
      { name: "Riviera", colors: ["16", "17"], color_images: { "16": "https://img/riviera-16.jpg" } },
    ]);
    expect(map[sampleImageKey(item({ fabric_name: "Riviera", color: "16" }))]).toBe(
      "https://img/riviera-16.jpg"
    );
    // Kolor bez wgranego zdjęcia po prostu go nie ma (miniatura → placeholder).
    expect(map[sampleImageKey(item({ color: "17" }))]).toBeUndefined();
  });
});
