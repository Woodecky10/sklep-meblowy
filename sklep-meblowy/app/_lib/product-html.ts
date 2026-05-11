import DOMPurify from "isomorphic-dompurify";

// ============================================================
// Sanitize HTML opisu produktu (z BaseLinkera lub admina)
// ============================================================
// Whitelist tagów odpowiednich dla opisów mebli — strukturalne paragrafy,
// listy, podkreślenia, nagłówki H2-H4 i linki. Bez img/video/script/iframe
// (nie chcemy żeby BL importował niezaufaną treść w DOM klienta).
const ALLOWED_TAGS = [
  "p",
  "br",
  "ul",
  "ol",
  "li",
  "strong",
  "em",
  "b",
  "i",
  "a",
  "h2",
  "h3",
  "h4",
  "span",
];

const ALLOWED_ATTR = ["href", "target", "rel"];

export function sanitizeProductHtml(html: string | null | undefined): string {
  if (!html) return "";
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    // Linki w opisach BL otwierają się w tej samej karcie domyślnie —
    // forsujemy noopener/noreferrer jeśli target=_blank.
    ADD_ATTR: ["target"],
  });
}

// ============================================================
// Krótki opis — pierwszy <p> z HTML, fallback 300 znaków
// ============================================================
// Używamy nad ProductActions jako podpis pod ceną. Pełny HTML zostaje
// w osobnej sekcji "Opis produktu" niżej.
export function extractShortDescription(
  html: string | null | undefined,
  maxLen = 300
): string {
  if (!html) return "";

  // Spróbuj wyciągnąć pierwszy <p>...</p>
  const pMatch = html.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
  const firstParagraph = pMatch ? stripTags(pMatch[1]) : null;

  if (firstParagraph && firstParagraph.trim().length > 0) {
    return firstParagraph.length <= maxLen
      ? firstParagraph.trim()
      : firstParagraph.slice(0, maxLen).trim() + "…";
  }

  // Brak <p> → fallback: strip wszystkie tagi i utnij do maxLen
  const plain = stripTags(html).trim();
  if (plain.length <= maxLen) return plain;
  return plain.slice(0, maxLen).trim() + "…";
}

function stripTags(html: string): string {
  // Zamień <br>, <br/>, <br /> na spacje przed usunięciem tagów,
  // żeby tekst po obu stronach nie sklejał się.
  return html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ");
}
