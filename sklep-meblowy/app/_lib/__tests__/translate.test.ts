import { describe, it, expect, vi } from "vitest";
import { translateTexts } from "@/app/_lib/translate";

function fakeFetch(translations: string[]) {
  return vi.fn(async () =>
    new Response(JSON.stringify({ translations: translations.map((t) => ({ text: t })) }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })
  );
}

describe("translateTexts (DeepL)", () => {
  it("buduje request PL→DE i parsuje odpowiedź", async () => {
    const f = fakeFetch(["Couch", "Bequem"]);
    const out = await translateTexts(["Sofa", "Wygodna"], {
      apiKey: "k", fetchImpl: f as unknown as typeof fetch,
    });
    expect(out).toEqual(["Couch", "Bequem"]);
    const [url, init] = f.mock.calls[0];
    expect(String(url)).toContain("api-free.deepl.com/v2/translate");
    expect((init as RequestInit).method).toBe("POST");
    const body = String((init as RequestInit).body);
    expect(body).toContain("source_lang=PL");
    expect(body).toContain("target_lang=DE");
    expect(body).toContain("text=Sofa");
  });
  it("html=true ustawia tag_handling", async () => {
    const f = fakeFetch(["<b>Couch</b>"]);
    await translateTexts(["<b>Sofa</b>"], { apiKey: "k", html: true, fetchImpl: f as unknown as typeof fetch });
    expect(String((f.mock.calls[0][1] as RequestInit).body)).toContain("tag_handling=html");
  });
  it("pusta lista → [] bez wywołania fetch", async () => {
    const f = vi.fn();
    expect(await translateTexts([], { apiKey: "k", fetchImpl: f as unknown as typeof fetch })).toEqual([]);
    expect(f).not.toHaveBeenCalled();
  });
  it("błąd HTTP → rzuca", async () => {
    const f = vi.fn(async () => new Response("nope", { status: 456 }));
    await expect(
      translateTexts(["x"], { apiKey: "k", fetchImpl: f as unknown as typeof fetch })
    ).rejects.toThrow();
  });
});
