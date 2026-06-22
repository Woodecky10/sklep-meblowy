// Normalizacja wyjścia edytora WYSIWYG (TipTap).
// TipTap dla pustej treści zwraca "<p></p>" — a logika override/dirty w panelu
// traktuje pusty string jako "brak treści/override". Sprowadzamy więc treść
// bez żadnego tekstu do "". Bez React → importowalne w node-testach.
export function normalizeEditorHtml(html: string): string {
  if (!html) return "";
  const text = html
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length === 0 ? "" : html.trim();
}
