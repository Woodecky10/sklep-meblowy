import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  OG_RENDERABLE_MIME,
  isOgRenderable,
  loadOgPhotoDataUri,
  ogPhotoCandidates,
  sniffImageMime,
} from "@/app/_lib/og-image";

const bytes = (...parts: (number | string)[]): Uint8Array =>
  new Uint8Array(
    parts.flatMap((p) =>
      typeof p === "string" ? [...p].map((c) => c.charCodeAt(0)) : [p]
    )
  );

// Minimalne nagłówki prawdziwych formatów — do rozpoznania wystarczy sygnatura.
const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, "JFIF");
const PNG = bytes(0x89, "PNG", 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00);
const WEBP = bytes("RIFF", 0x24, 0x00, 0x00, 0x00, "WEBP", "VP8 ");
const AVIF = bytes(0x00, 0x00, 0x00, 0x1c, "ftyp", "avif", 0x00, 0x00);
const AVIS = bytes(0x00, 0x00, 0x00, 0x1c, "ftyp", "avis", 0x00, 0x00);

describe("sniffImageMime", () => {
  test("rozpoznaje formaty, które Satori narysuje", () => {
    expect(sniffImageMime(JPEG)).toBe("image/jpeg");
    expect(sniffImageMime(PNG)).toBe("image/png");
  });

  test("rozpoznaje WebP i AVIF (żeby dało się je świadomie odrzucić)", () => {
    expect(sniffImageMime(WEBP)).toBe("image/webp");
    expect(sniffImageMime(AVIF)).toBe("image/avif");
    expect(sniffImageMime(AVIS)).toBe("image/avif");
  });

  test("zwraca null dla śmieci i wejścia krótszego niż sygnatura", () => {
    expect(sniffImageMime(bytes("<!doctype html>"))).toBeNull();
    expect(sniffImageMime(bytes(0xff, 0xd8))).toBeNull();
    expect(sniffImageMime(new Uint8Array())).toBeNull();
  });

  // Prawdziwy plik z bucketu home-slides: nazwa kończy się na .png, w środku
  // JPEG. Rozpoznajemy po zawartości właśnie dlatego, że nazwy kłamią.
  test("idzie za zawartością, nie za rozszerzeniem w nazwie pliku", () => {
    expect(sniffImageMime(JPEG)).toBe("image/jpeg");
  });

  test("RIFF bez znacznika WEBP to nie WebP (np. WAV)", () => {
    expect(sniffImageMime(bytes("RIFF", 0x24, 0x00, 0x00, 0x00, "WAVE"))).toBeNull();
  });
});

describe("isOgRenderable", () => {
  // Empiryczne: render testowy przez next/og dał OK dla JPEG i PNG,
  // a "u2 is not iterable" dla WebP i AVIF. Gdyby ta bramka przepuściła
  // WebP, jeden upload zgasiłby og:image na całym sklepie.
  test("przepuszcza wyłącznie JPEG i PNG", () => {
    expect(isOgRenderable("image/jpeg")).toBe(true);
    expect(isOgRenderable("image/png")).toBe(true);
    expect(isOgRenderable("image/webp")).toBe(false);
    expect(isOgRenderable("image/avif")).toBe(false);
    expect(isOgRenderable(null)).toBe(false);
  });

  test("OG_RENDERABLE_MIME nie zawiera formatów wywalających render", () => {
    expect(OG_RENDERABLE_MIME).not.toContain("image/webp");
    expect(OG_RENDERABLE_MIME).not.toContain("image/avif");
  });
});

describe("ogPhotoCandidates", () => {
  test("zdjęcie z panelu wygrywa nad slajdem", () => {
    expect(ogPhotoCandidates("https://cdn/wybrane.jpg", ["https://cdn/slajd.jpg"])).toEqual([
      "https://cdn/wybrane.jpg",
      "https://cdn/slajd.jpg",
    ]);
  });

  test("bez wyboru w panelu schodzi na pierwszy slajd", () => {
    expect(ogPhotoCandidates(null, ["https://cdn/slajd1.jpg", "https://cdn/slajd2.jpg"])).toEqual([
      "https://cdn/slajd1.jpg",
      "https://cdn/slajd2.jpg",
    ]);
  });

  test("brak czegokolwiek daje pustą listę (wołający rysuje kartę brandową)", () => {
    expect(ogPhotoCandidates(null)).toEqual([]);
    expect(ogPhotoCandidates(undefined, [])).toEqual([]);
    expect(ogPhotoCandidates("   ", [null, undefined, ""])).toEqual([]);
  });

  test("pomija slajdy bez zdjęcia, zachowując kolejność", () => {
    expect(ogPhotoCandidates(null, [null, "https://cdn/b.jpg", undefined, "https://cdn/c.jpg"])).toEqual(
      ["https://cdn/b.jpg", "https://cdn/c.jpg"]
    );
  });

  // Każdy kandydat kosztuje jedno pobranie w renderze obrazka.
  test("nie duplikuje adresu, gdy w panelu wybrano to samo zdjęcie co na slajdzie", () => {
    expect(ogPhotoCandidates("https://cdn/a.jpg", ["https://cdn/a.jpg", "https://cdn/b.jpg"])).toEqual([
      "https://cdn/a.jpg",
      "https://cdn/b.jpg",
    ]);
  });

  test("przycina białe znaki wokół adresu", () => {
    expect(ogPhotoCandidates("  https://cdn/a.jpg  ")).toEqual(["https://cdn/a.jpg"]);
  });
});

// Najważniejsza właściwość całej ścieżki: JEDEN zły plik nie może zgasić
// og:image na wszystkich stronach. Zły kandydat ma być pominięty, a nie rzucić.
describe("loadOgPhotoDataUri", () => {
  // .slice() daje kopię z własnym ArrayBufferem — Response nie przyjmuje
  // Uint8Array nad ArrayBufferLike (SharedArrayBuffer nie jest BodyInit).
  const okRes = (body: Uint8Array) =>
    new Response(body.slice().buffer as ArrayBuffer, { status: 200 });

  function fakeFetch(byUrl: Record<string, () => Promise<Response>>) {
    const calls: string[] = [];
    const impl = (async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      const handler = byUrl[url];
      if (!handler) throw new Error(`nieoczekiwany URL ${url}`);
      return handler();
    }) as unknown as typeof fetch;
    return { impl, calls };
  }

  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("zwraca data URI dla JPEG i PNG", async () => {
    const j = fakeFetch({ "a.jpg": async () => okRes(JPEG) });
    await expect(loadOgPhotoDataUri(["a.jpg"], j.impl)).resolves.toMatch(
      /^data:image\/jpeg;base64,/
    );
    const p = fakeFetch({ "a.png": async () => okRes(PNG) });
    await expect(loadOgPhotoDataUri(["a.png"], p.impl)).resolves.toMatch(
      /^data:image\/png;base64,/
    );
  });

  test("pomija WebP (wywala Satori) i bierze kolejnego kandydata", async () => {
    const f = fakeFetch({
      "zle.webp": async () => okRes(WEBP),
      "dobre.jpg": async () => okRes(JPEG),
    });
    await expect(loadOgPhotoDataUri(["zle.webp", "dobre.jpg"], f.impl)).resolves.toMatch(
      /^data:image\/jpeg;base64,/
    );
    expect(f.calls).toEqual(["zle.webp", "dobre.jpg"]);
  });

  test("pomija AVIF tak samo jak WebP", async () => {
    const f = fakeFetch({
      "zle.avif": async () => okRes(AVIF),
      "dobre.png": async () => okRes(PNG),
    });
    await expect(loadOgPhotoDataUri(["zle.avif", "dobre.png"], f.impl)).resolves.toMatch(
      /^data:image\/png;base64,/
    );
  });

  test("pomija odpowiedź 404", async () => {
    const f = fakeFetch({
      "nie-ma.jpg": async () => new Response("", { status: 404 }),
      "jest.jpg": async () => okRes(JPEG),
    });
    await expect(loadOgPhotoDataUri(["nie-ma.jpg", "jest.jpg"], f.impl)).resolves.toMatch(
      /^data:image\/jpeg;base64,/
    );
  });

  test("pomija błąd sieci / timeout, zamiast go propagować", async () => {
    const f = fakeFetch({
      "timeout.jpg": async () => {
        throw new Error("TimeoutError");
      },
      "jest.jpg": async () => okRes(JPEG),
    });
    await expect(loadOgPhotoDataUri(["timeout.jpg", "jest.jpg"], f.impl)).resolves.toMatch(
      /^data:image\/jpeg;base64,/
    );
  });

  test("gdy żaden kandydat się nie nadaje → null (wołający rysuje kartę brandową)", async () => {
    const f = fakeFetch({
      "a.webp": async () => okRes(WEBP),
      "b.jpg": async () => new Response("", { status: 500 }),
    });
    await expect(loadOgPhotoDataUri(["a.webp", "b.jpg"], f.impl)).resolves.toBeNull();
  });

  test("pusta lista kandydatów nie robi żadnego zapytania", async () => {
    const f = fakeFetch({});
    await expect(loadOgPhotoDataUri([], f.impl)).resolves.toBeNull();
    expect(f.calls).toEqual([]);
  });
});
