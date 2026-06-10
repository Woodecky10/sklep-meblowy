// ============================================================
// Sanitize HTML opisu produktu (z BaseLinkera lub admina)
// ============================================================
// Regex-based whitelist sanitizer — bez external deps (zero jsdom,
// zero @exodus/bytes ESM mismatch w runtime Vercela).
//
// Whitelist tagów odpowiednich dla opisów mebli — strukturalne paragrafy,
// listy, podkreślenia, nagłówki H2-H4 i linki. Bez img/video/script/iframe.
//
// Source produktu jest zaufany (admin lub BL → sklep), więc nie potrzebujemy
// pełnej HTML5 spec compliance. Wystarczy whitelist + block javascript:.

const ALLOWED_TAGS = new Set([
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
]);

// Atrybuty dozwolone per tag. Domyślnie brak — dla <a> wyjątek.
const ALLOWED_ATTRS_PER_TAG: Record<string, Set<string>> = {
  a: new Set(["href", "target", "rel"]),
};

// Domeny które wycinamy z linków w opisie BL — sprzedaż na Allegro idzie
// przez BL, więc w opisach z BL regularnie pojawiają się linki "Zobacz
// inne aukcje" i podobne CTA niespójne ze sklepem Mollien.
// Strategia: zachowaj tekst linku, usuń sam tag <a>.
const BLOCKED_LINK_DOMAINS = [
  "allegro.pl",
  "allegrolokalnie.pl",
  "allegro.cz",
  "allegro.sk",
];

function isBlockedHref(href: string): boolean {
  if (!href) return false;
  const lower = href.toLowerCase();
  return BLOCKED_LINK_DOMAINS.some(
    (d) => lower.includes(`://${d}`) || lower.includes(`://www.${d}`)
  );
}

// Tagi w całości wycinane wraz z zawartością — niezaufana treść skryptowa.
const DANGEROUS_BLOCK_TAGS = [
  "script",
  "style",
  "iframe",
  "noscript",
  "object",
  "form",
  "svg",
  "math",
];

function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function sanitizeProductHtml(html: string | null | undefined): string {
  if (!html) return "";

  let cleaned = html;

  // 1. Usuń niebezpieczne tagi blokowe wraz z całą zawartością
  for (const tag of DANGEROUS_BLOCK_TAGS) {
    const blockRegex = new RegExp(`<${tag}\\b[\\s\\S]*?</${tag}>`, "gi");
    const selfClosingRegex = new RegExp(`<${tag}\\b[^>]*/>`, "gi");
    cleaned = cleaned.replace(blockRegex, "").replace(selfClosingRegex, "");
  }

  // 2. Usuń komentarze HTML (mogą zawierać conditional comments, IE hacks)
  cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, "");

  // 3. Każdy tag — albo zachowaj (jeśli whitelist), albo wytnij (zachowując
  // wewnętrzny tekst dla nie-whitelistowanych).
  cleaned = cleaned.replace(
    /<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*?)\/?>/g,
    (full, rawTag: string, attrs: string) => {
      const tag = rawTag.toLowerCase();
      if (!ALLOWED_TAGS.has(tag)) {
        // Drop tag, keep content (content jest poza match-em)
        return "";
      }

      // Closing tag
      if (full.startsWith("</")) return `</${tag}>`;

      // Self-closing void elements (np. <br/>)
      const isSelfClosing = /\/\s*>$/.test(full);
      const closingSlash = isSelfClosing ? " /" : "";

      // Opening tag — filtruj atrybuty
      const allowedAttrs = ALLOWED_ATTRS_PER_TAG[tag];
      if (!allowedAttrs || allowedAttrs.size === 0) {
        return `<${tag}${closingSlash}>`;
      }

      const cleanAttrs: string[] = [];
      const attrRegex = /\s+([a-zA-Z][a-zA-Z0-9\-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
      let m: RegExpExecArray | null;
      while ((m = attrRegex.exec(attrs)) !== null) {
        const attrName = m[1].toLowerCase();
        const attrValue = m[2] ?? m[3] ?? "";
        if (!allowedAttrs.has(attrName)) continue;

        // Block javascript:, data:, vbscript: URLs w href/src
        if (attrName === "href" || attrName === "src") {
          const lower = attrValue.toLowerCase().trim();
          if (
            lower.startsWith("javascript:") ||
            lower.startsWith("vbscript:") ||
            lower.startsWith("data:")
          ) {
            continue;
          }
        }

        cleanAttrs.push(`${attrName}="${escapeHtmlAttr(attrValue)}"`);
      }

      return `<${tag}${cleanAttrs.length > 0 ? " " + cleanAttrs.join(" ") : ""}${closingSlash}>`;
    }
  );

  // 4. Usuń linki do zablokowanych domen (allegro.pl etc.) zachowując tekst.
  cleaned = stripBlockedLinks(cleaned);

  return cleaned;
}

// Usuwa tagi <a href="..."> wskazujące na zablokowane domeny, zachowując
// tekst wewnątrz. Wywoływane po podstawowej sanityzacji.
function stripBlockedLinks(html: string): string {
  return html.replace(
    /<a\b([^>]*)>([\s\S]*?)<\/a>/gi,
    (full, attrs: string, inner: string) => {
      const hrefMatch = attrs.match(/href\s*=\s*["']([^"']+)["']/i);
      if (hrefMatch && isBlockedHref(hrefMatch[1])) {
        return inner;
      }
      return full;
    }
  );
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
