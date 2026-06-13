const DEEPL_URL = "https://api-free.deepl.com/v2/translate";

export type TranslateOpts = {
  apiKey?: string;            // domyślnie process.env.DEEPL_API_KEY
  html?: boolean;             // tag_handling=html dla treści z HTML
  fetchImpl?: typeof fetch;   // wstrzykiwany w testach
};

// PL→DE. Zwraca tłumaczenia w tej samej kolejności co wejście.
// Rzuca przy braku klucza / błędzie HTTP — caller łapie (best-effort).
export async function translateTexts(
  texts: string[],
  opts: TranslateOpts = {}
): Promise<string[]> {
  if (texts.length === 0) return [];
  const apiKey = opts.apiKey ?? process.env.DEEPL_API_KEY;
  if (!apiKey) throw new Error("DEEPL_API_KEY nie jest ustawiony");
  const doFetch = opts.fetchImpl ?? fetch;

  const params = new URLSearchParams();
  params.set("source_lang", "PL");
  params.set("target_lang", "DE");
  if (opts.html) params.set("tag_handling", "html");
  for (const t of texts) params.append("text", t);

  const res = await doFetch(DEEPL_URL, {
    method: "POST",
    headers: {
      Authorization: `DeepL-Auth-Key ${apiKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });
  if (!res.ok) throw new Error(`DeepL HTTP ${res.status}`);
  const data = (await res.json()) as { translations: { text: string }[] };
  return (data.translations ?? []).map((t) => t.text);
}
