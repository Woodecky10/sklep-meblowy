// ============================================================
// Sanitize HTML opisu produktu
// ============================================================
// Regex-based whitelist sanitizer — bez external deps (zero jsdom,
// zero @exodus/bytes ESM mismatch w runtime Vercela).
//
// Whitelist tagów odpowiednich dla opisów mebli — strukturalne paragrafy,
// listy, podkreślenia, nagłówki H2-H4, linki i img. Bez video/script/iframe/style-taga.
//
// Source produktu jest zaufany (admin → sklep), więc nie potrzebujemy
// pełnej HTML5 spec compliance. Wystarczy whitelist + block javascript:.

import { FONT_OPTIONS, normalizeFontStack } from "@/app/_lib/description-fonts";
import type { ProductDescriptionSection } from "@/app/_lib/types";

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
  "u",
  "s",
  "blockquote",
  "mark",
  "img",
]);

// Atrybuty dozwolone per tag. Domyślnie brak — wyjątki poniżej.
const ALLOWED_ATTRS_PER_TAG: Record<string, Set<string>> = {
  a: new Set(["href", "target", "rel"]),
  img: new Set(["src", "alt"]),
  p: new Set(["style"]),
  h2: new Set(["style"]),
  h3: new Set(["style"]),
  h4: new Set(["style"]),
  span: new Set(["style"]),
};

// Domeny które wycinamy z linków w opisie — w opisach produktów regularnie
// pojawiają się linki "Zobacz inne aukcje" i podobne CTA niespójne ze sklepem
// Mollien. Strategia: zachowaj tekst linku, usuń sam tag <a>.
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

// Schematy URL dozwolone w href/src. Whitelist (nie blocklist) — odrzuca z
// definicji wszystko nieznane (javascript:, vbscript:, data:, file: itd.).
const SAFE_URL_SCHEMES = new Set(["http", "https", "mailto", "tel"]);

// Czy URL ma bezpieczny schemat? Normalizacja odporna na obejścia: przeglądarka
// IGNORUJE znaki sterujące i białe wewnątrz schematu URL, więc href="java\nscript:…"
// jest interpretowane jako javascript:. Dlatego usuwamy je PRZED sprawdzeniem
// schematu (samo .trim() łapało tylko skrajne znaki). URL bez schematu
// (relatywny, #kotwica, ?query) jest dozwolony.
function hasSafeUrlScheme(value: string): boolean {
  const normalized = value
    .replace(/[\u0000-\u0020\u00A0\u2028\u2029\uFEFF]/g, "")
    .toLowerCase();
  const schemeMatch = normalized.match(/^([a-z][a-z0-9+.-]*):/);
  if (!schemeMatch) return true; // brak schematu -> relatywny / kotwica
  return SAFE_URL_SCHEMES.has(schemeMatch[1]);
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

// Wlasciwosci CSS dozwolone per tag — reszta wycinana.
const ALLOWED_STYLE_PROPS: Record<string, Set<string>> = {
  p: new Set(["text-align"]),
  h2: new Set(["text-align"]),
  h3: new Set(["text-align"]),
  h4: new Set(["text-align"]),
  span: new Set(["color", "font-family"]),
};
const TEXT_ALIGN_VALUES = new Set(["left", "center", "right", "justify"]);

// Bezpieczna wartosc koloru: hex / rgb()/rgba() / nazwa CSS. Twardo odrzuca
// konstrukcje mogace wstrzyknac kod (url, expression, komentarze, nawiasy klamrowe).
function isSafeColorValue(v: string): boolean {
  const s = v.trim().toLowerCase();
  if (/[<>;{}\\]/.test(s)) return false;
  if (s.includes("url(") || s.includes("expression") || s.includes("/*") || s.includes("*/")) return false;
  if (/^#[0-9a-f]{3,8}$/.test(s)) return true;
  if (/^rgba?\([0-9.,%\s]+\)$/.test(s)) return true;
  if (/^[a-z]+$/.test(s)) return true; // nazwa CSS np. "red"
  return false;
}

// Przepuszcza WYLACZNIE bezpieczne deklaracje CSS dla danego tagu.
export function sanitizeStyleAttr(tag: string, raw: string): string {
  const allowed = ALLOWED_STYLE_PROPS[tag];
  if (!allowed) return "";
  const out: string[] = [];
  for (const decl of raw.split(";")) {
    const idx = decl.indexOf(":");
    if (idx === -1) continue;
    const prop = decl.slice(0, idx).trim().toLowerCase();
    const value = decl.slice(idx + 1).trim();
    if (!allowed.has(prop)) continue;
    if (prop === "text-align") {
      if (TEXT_ALIGN_VALUES.has(value.toLowerCase())) out.push(`text-align: ${value.toLowerCase()}`);
    } else if (prop === "color") {
      if (isSafeColorValue(value)) out.push(`color: ${value}`);
    } else if (prop === "font-family") {
      // Zamknięta lista stacków (description-fonts) — wyjście ZAWSZE kanoniczne.
      const canonical = FONT_OPTIONS.find(
        (o) => normalizeFontStack(o.stack) === normalizeFontStack(value)
      );
      if (canonical) out.push(`font-family: ${canonical.stack}`);
    }
  }
  return out.join("; ");
}

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

        // Whitelist bezpiecznych schematów URL w href/src — odporna na obejścia
        // ze znakami sterującymi (java\nscript:). Niebezpieczny → drop atrybutu.
        if (
          (attrName === "href" || attrName === "src") &&
          !hasSafeUrlScheme(attrValue)
        ) {
          continue;
        }

        if (attrName === "style") {
          const cleanStyle = sanitizeStyleAttr(tag, attrValue);
          if (cleanStyle) cleanAttrs.push(`style="${escapeHtmlAttr(cleanStyle)}"`);
          continue;
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

// ============================================================
// Sanitize sekcji opisu przy ZAPISIE (defense-in-depth)
// ============================================================
// Render już sanityzuje, ale sanityzacja przy zapisie gwarantuje, że w bazie
// ląduje wyłącznie whitelistowany HTML — niezależnie od tego, co wypluje edytor
// WYSIWYG. Tytuły (plain text) zostają nietknięte. Sekcje image bez zmian.
export function sanitizeSectionsHtml(
  sections: ProductDescriptionSection[]
): ProductDescriptionSection[] {
  return sections.map((s) => {
    if (s.kind !== "text") return s;
    const next: ProductDescriptionSection = {
      ...s,
      body: sanitizeProductHtml(s.body),
    };
    if (typeof s.admin_body === "string") {
      next.admin_body = sanitizeProductHtml(s.admin_body);
    }
    return next;
  });
}
