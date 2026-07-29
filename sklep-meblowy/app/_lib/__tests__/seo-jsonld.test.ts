import { describe, expect, test } from "vitest";
import { COMPANY } from "@/app/_lib/company";
import {
  buildBreadcrumbJsonLd,
  buildOrganizationJsonLd,
  serializeJsonLd,
} from "@/app/_lib/seo-jsonld";

const BASE = `https://${COMPANY.domain}`;

describe("serializeJsonLd", () => {
  // Audyt 2026-06-11 (LOW): nazwa produktu z "</script>" wybijała się z bloku
  // JSON-LD i wstrzykiwała skrypt. Escape `<` zamyka to raz dla wszystkich
  // bloków JSON-LD w sklepie.
  test("escapuje `<`, więc `</script>` nie wybija się z bloku", () => {
    const out = serializeJsonLd({ name: "Sofa </script><img onerror=x>" });
    expect(out).not.toContain("<");
    expect(out).toContain("\\u003c");
  });

  test("po sparsowaniu daje z powrotem te same dane", () => {
    const data = { name: "Sofa <b>XL</b>", price: 1299 };
    expect(JSON.parse(serializeJsonLd(data))).toEqual(data);
  });
});

describe("buildOrganizationJsonLd", () => {
  test("jest Organization zakotwiczoną @id (żeby inne bloki mogły ją referować)", () => {
    const org = buildOrganizationJsonLd();
    expect(org["@context"]).toBe("https://schema.org");
    expect(org["@type"]).toBe("Organization");
    expect(org["@id"]).toBe(`${BASE}/#organization`);
  });

  test("niesie nazwę handlową, nazwę prawną i URL sklepu", () => {
    const org = buildOrganizationJsonLd();
    expect(org.name).toBe(COMPANY.brandName);
    expect(org.legalName).toBe(COMPANY.legalName);
    expect(org.url).toBe(BASE);
  });

  test("logo jest absolutnym rastrem (Google odrzuca SVG w logo)", () => {
    const logo = buildOrganizationJsonLd().logo as string;
    expect(logo.startsWith("https://")).toBe(true);
    expect(logo).toMatch(/\.(png|jpe?g|gif)$/i);
  });

  test("niesie adres rejestrowy jako PostalAddress", () => {
    const address = buildOrganizationJsonLd().address as Record<string, string>;
    expect(address["@type"]).toBe("PostalAddress");
    expect(address.streetAddress).toBe(COMPANY.address.street);
    expect(address.postalCode).toBe(COMPANY.address.postalCode);
    expect(address.addressLocality).toBe(COMPANY.address.city);
    expect(address.addressCountry).toBe("PL");
  });

  test("niesie NIP jako vatID w formacie unijnym", () => {
    expect(buildOrganizationJsonLd().vatID).toBe(`PL${COMPANY.nip}`);
  });

  test("niesie kontakt obsługi klienta w obu językach sklepu", () => {
    const contact = buildOrganizationJsonLd().contactPoint as Record<string, unknown>;
    expect(contact["@type"]).toBe("ContactPoint");
    expect(contact.email).toBe(COMPANY.email);
    expect(contact.telephone).toBe(COMPANY.phone);
    expect(contact.availableLanguage).toEqual(["pl", "de"]);
  });
});

describe("buildBreadcrumbJsonLd", () => {
  const crumbs = [
    { name: "Start", path: "/" },
    { name: "Sklep", path: "/sklep" },
    { name: "Narożniki", path: "/sklep?kategoria=narozniki" },
    { name: "Sofa VEGAS" },
  ];

  test("numeruje pozycje od 1 w kolejności ścieżki", () => {
    const list = buildBreadcrumbJsonLd(crumbs, "pl")!;
    expect(list["@type"]).toBe("BreadcrumbList");
    const items = list.itemListElement as Array<Record<string, unknown>>;
    expect(items.map((i) => i.position)).toEqual([1, 2, 3, 4]);
    expect(items.map((i) => i.name)).toEqual([
      "Start",
      "Sklep",
      "Narożniki",
      "Sofa VEGAS",
    ]);
  });

  test("URL-e są absolutne (Google wymaga absolutnych w `item`)", () => {
    const items = buildBreadcrumbJsonLd(crumbs, "pl")!.itemListElement as Array<
      Record<string, unknown>
    >;
    expect(items[0].item).toBe(`${BASE}/`);
    expect(items[1].item).toBe(`${BASE}/sklep`);
    expect(items[2].item).toBe(`${BASE}/sklep?kategoria=narozniki`);
  });

  test("ostatni okruch (bieżąca strona) nie ma `item`", () => {
    const items = buildBreadcrumbJsonLd(crumbs, "pl")!.itemListElement as Array<
      Record<string, unknown>
    >;
    expect(items[3]).not.toHaveProperty("item");
    expect(items[3].name).toBe("Sofa VEGAS");
  });

  test("na DE prefiksuje ścieżki /de — okruchy nie mogą wieźć na PL", () => {
    const items = buildBreadcrumbJsonLd(crumbs, "de")!.itemListElement as Array<
      Record<string, unknown>
    >;
    expect(items[0].item).toBe(`${BASE}/de`);
    expect(items[1].item).toBe(`${BASE}/de/sklep`);
  });

  test("pojedynczy okruch nie jest ścieżką — zwraca null zamiast pustej listy", () => {
    expect(buildBreadcrumbJsonLd([{ name: "Start", path: "/" }], "pl")).toBeNull();
    expect(buildBreadcrumbJsonLd([], "pl")).toBeNull();
  });

  test("pomija okruchy bez nazwy (np. nieznana kategoria)", () => {
    const list = buildBreadcrumbJsonLd(
      [{ name: "Start", path: "/" }, { name: "  " }, { name: "Sofa" }],
      "pl"
    )!;
    const items = list.itemListElement as Array<Record<string, unknown>>;
    expect(items.map((i) => i.name)).toEqual(["Start", "Sofa"]);
    expect(items.map((i) => i.position)).toEqual([1, 2]);
  });
});
