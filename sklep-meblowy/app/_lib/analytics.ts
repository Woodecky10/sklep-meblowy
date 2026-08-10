// Google Analytics 4 — identyfikator i mapowanie zgód cookie na Consent Mode v2.
// Moduł CZYSTY (bez server-only): importuje go komponent kliencki i test.
//
// Identyfikator siedzi w NEXT_PUBLIC_GA_ID, a nie w kodzie, bo to decyzja
// właścicielska, nie techniczna: przepięcie sklepu na inną usługę GA4 (np. z
// konta agencji na konto firmowe) ma być zmianą jednej zmiennej w hostingu,
// nie commitem. UWAGA: NEXT_PUBLIC_* jest wstrzykiwane na etapie builda —
// zmiana wartości w panelu Vercela wymaga Redeploy.

export type ConsentDecision = { analytics: boolean; marketing: boolean };

export type ConsentSignals = {
  analytics_storage: "granted" | "denied";
  ad_storage: "granted" | "denied";
  ad_user_data: "granted" | "denied";
  ad_personalization: "granted" | "denied";
};

// G- + 10 znaków w praktyce; zakres 6–15 zostawia luz na przyszłe formaty.
const GA_ID_RE = /^G-[A-Z0-9]{6,15}$/;

export function isValidGaId(id: string): boolean {
  return GA_ID_RE.test(id);
}

const RAW_GA_ID = process.env.NEXT_PUBLIC_GA_ID ?? "";

// Pusty string = analityka wyłączona (brak zmiennej albo literówka w wartości).
// Świadomie nie rzucamy: brak GA nie może wywalić sklepu, a nieodfiltrowana
// literówka oznaczałaby ładowanie skryptu z bezsensownym id.
export const GA_MEASUREMENT_ID = isValidGaId(RAW_GA_ID) ? RAW_GA_ID : "";

// Baner ma dwa przełączniki, Google oczekuje czterech sygnałów. Zgoda
// „analityczne" steruje wyłącznie analytics_storage — trzy sygnały reklamowe
// wiszą na zgodzie „marketingowe", żeby zgoda na statystyki nie włączała po
// cichu remarketingu.
export function gaConsentSignals(c: ConsentDecision): ConsentSignals {
  const ads = c.marketing ? "granted" : "denied";
  return {
    analytics_storage: c.analytics ? "granted" : "denied",
    ad_storage: ads,
    ad_user_data: ads,
    ad_personalization: ads,
  };
}
