// Czyste funkcje pipeline'u tłumaczeń PL→DE. ZERO efektów ubocznych przy
// imporcie (poza odczytem .env.local, który jest jawną funkcją) — dzięki temu
// całość jest testowalna vitestem bez mockowania Supabase.
//
// Pipeline: export.mjs → batch.mjs → (agenci tłumaczą) → validate.mjs → import.mjs
// Wspólny mianownik: „jednostka tłumaczenia" { key, kind, text, ctx?, ref? }.
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

// ── env ───────────────────────────────────────────────────────────────────
// Minimalny parser .env.local — bez zależności (kopia wzorca z p24-smoke.mjs).
// Obsługuje KEY=VALUE, komentarze i cudzysłowy; ignoruje puste linie.
// Skrypty standalone nie dostają env od Next-a, więc czytamy plik ręcznie.
export function loadEnvLocal(fileUrl = new URL("../../.env.local", import.meta.url)) {
  let raw;
  try {
    raw = readFileSync(fileUrl, "utf8");
  } catch {
    return {};
  }
  const out = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!m) continue;
    out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

// ── jednostki tłumaczenia ─────────────────────────────────────────────────
// Klucz jednostki = 12 pierwszych hex sha256("kind\ntext"). Deterministyczny
// (ten sam tekst w tej samej roli = ten sam klucz w eksporcie i w imporcie,
// nawet gdy import liczy go ze ŚWIEŻEGO wiersza z bazy). `kind` wchodzi do
// hasha, żeby ten sam string w innej roli dostał inny klucz.
export function unitKey(kind, text) {
  return createHash("sha256").update(`${kind}\n${text}`, "utf8").digest("hex").slice(0, 12);
}

// Bezpieczny odczyt ze słownika tłumaczeń. Przyjmuje Map albo zwykły obiekt —
// przy obiekcie NIE używamy `obj[key]` wprost, bo klucz typu "constructor"
// zwróciłby funkcję z prototypu (znany prod-bug w tym repo).
export function lookupTranslation(translations, key) {
  if (!translations) return undefined;
  if (translations instanceof Map) return translations.get(key);
  if (!Object.hasOwn(translations, key)) return undefined;
  const v = translations[key];
  return typeof v === "string" ? v : undefined;
}

function str(v) {
  return typeof v === "string" ? v : "";
}

function nonEmpty(v) {
  return str(v).trim().length > 0;
}

// Tekst PL WIDOCZNY w sklepie dla sekcji tekstowej:
//   title = admin_title?.trim() || title
//   body  = admin_body?.trim() ? admin_body : body
// (dokładnie jak render karty produktu i podgląd w TranslationEditor).
// To ten tekst tłumaczymy — nie surowy title/body z importu.
export function visibleTextSection(section) {
  const s = section ?? {};
  const adminTitle = str(s.admin_title).trim();
  const adminBody = str(s.admin_body).trim();
  return {
    title: adminTitle || str(s.title),
    body: adminBody ? str(s.admin_body) : str(s.body),
  };
}

// Sekcje PL sprowadzone do postaci „co widzi klient" — to trafia do
// pl/products.json jako materiał dla tłumacza (bez admin_* i bez szumu).
export function normalizeProductSections(sections) {
  const list = Array.isArray(sections) ? sections : [];
  return list.map((s) => {
    if (s?.kind === "image") {
      const out = { kind: "image", image_url: str(s.image_url), image_alt: str(s.image_alt) };
      if (str(s.caption) !== "") out.caption = str(s.caption);
      if (s.display) out.display = s.display;
      return out;
    }
    const { title, body } = visibleTextSection(s);
    const out = { kind: "text", title, body };
    if (s?.hidden !== undefined) out.hidden = s.hidden;
    if (s?.admin_custom !== undefined) out.admin_custom = s.admin_custom;
    return out;
  });
}

function unit(kind, text, ctx, ref) {
  const u = { key: unitKey(kind, text), kind, text };
  if (ctx) u.ctx = ctx;
  if (ref) u.ref = ref;
  return u;
}

// Jednostki z jednego produktu: nazwa + tytuły/treści sekcji + alty/podpisy
// zdjęć. Sekcje `hidden` też eksportujemy (jest ich garść, a /de podmienia
// CAŁĄ tablicę sekcji — niekompletna tablica = dziura na stronie).
export function unitsFromProduct(product) {
  const out = [];
  const name = str(product?.name);
  const label = name || String(product?.id ?? "?");
  if (nonEmpty(name)) {
    out.push(
      unit(
        "product_name",
        name,
        "nazwa produktu (mebel) — zachowaj nazwy własne modeli, kody tkanin i wymiary"
      )
    );
  }
  const sections = Array.isArray(product?.description_sections) ? product.description_sections : [];
  sections.forEach((s, i) => {
    const no = i + 1;
    if (s?.kind === "image") {
      if (nonEmpty(s.image_alt)) {
        out.push(unit("image_alt", str(s.image_alt), `produkt „${label}": alt zdjęcia w sekcji ${no}`));
      }
      if (nonEmpty(s.caption)) {
        out.push(unit("caption", str(s.caption), `produkt „${label}": podpis zdjęcia w sekcji ${no}`));
      }
      return;
    }
    const { title, body } = visibleTextSection(s);
    if (nonEmpty(title)) {
      out.push(unit("section_title", title, `produkt „${label}": tytuł sekcji opisu ${no}`));
    }
    if (nonEmpty(body)) {
      out.push(
        unit("section_body", body, `produkt „${label}": treść sekcji opisu ${no} (HTML — zachowaj tagi)`)
      );
    }
  });
  return out;
}

// Czy wiersz z kolumną `_de` kwalifikuje się do tłumaczenia:
// PL niepuste i DE puste (albo `force`).
function needsDe(pl, de, force) {
  if (!nonEmpty(pl)) return false;
  return force ? true : !nonEmpty(de);
}

// Jednostki ze wszystkich tabel poza produktami i poza mapami kodu.
// `misc` = obiekt zapisany do pl/misc.json (patrz export.mjs).
export function unitsFromMisc(misc, { force = false } = {}) {
  const out = [];
  const push = (cond, kind, text, ctx, ref) => {
    if (cond) out.push(unit(kind, str(text), ctx, ref));
  };

  for (const r of misc?.categories ?? []) {
    push(
      needsDe(r.label, r.label_de, force),
      "category_label",
      r.label,
      `nazwa kategorii mebli, slug: ${r.slug}`
    );
  }

  for (const r of misc?.collections ?? []) {
    push(
      needsDe(r.label, r.label_de, force),
      "collection_label",
      r.label,
      `nazwa kolekcji mebli, slug: ${r.slug}`
    );
    push(
      needsDe(r.description, r.description_de, force),
      "collection_description",
      r.description,
      `opis kolekcji „${r.label}"`
    );
  }

  for (const r of misc?.bundles ?? []) {
    push(needsDe(r.name, r.name_de, force), "bundle_name", r.name, "nazwa zestawu mebli (bundle)");
  }

  // fabrics.name_de POMIJAMY świadomie — nazwy tkanin to nazwy własne/kody.
  for (const r of misc?.fabrics ?? []) {
    push(
      needsDe(r.description, r.description_de, force),
      "fabric_description",
      r.description,
      `opis tkaniny „${r.name}"`
    );
    push(
      needsDe(r.short_info, r.short_info_de, force),
      "fabric_short_info",
      r.short_info,
      `krótka informacja o tkaninie „${r.name}" (pigułka na karcie)`
    );
  }

  for (const r of misc?.fabric_property_defs ?? []) {
    push(
      needsDe(r.label, r.label_de, force),
      "fabric_property_label",
      r.label,
      `etykieta cechy tkaniny (kod: ${r.code}) — krótka, 1–3 słowa`
    );
  }

  for (const r of misc?.variant_info ?? []) {
    push(
      needsDe(r.info, r.info_de, force),
      "variant_info",
      r.info,
      `podpowiedź przy opcji „${r.option_name}" = „${r.value}"`
    );
  }

  (misc?.home_slides ?? []).forEach((r, i) => {
    const no = i + 1;
    push(
      needsDe(r.title, r.title_de, force),
      "slide_title",
      r.title,
      `slajd ${no} na stronie głównej: tytuł hero`,
      { slideId: r.id }
    );
    push(needsDe(r.subtitle, r.subtitle_de, force), "slide_subtitle", r.subtitle, `slajd ${no}: podtytuł`);
    push(
      needsDe(r.eyebrow, r.eyebrow_de, force),
      "slide_eyebrow",
      r.eyebrow,
      `slajd ${no}: nadtytuł (krótki, nad tytułem)`
    );
    if (needsDe(r.highlighted_word, r.highlighted_word_de, force)) {
      // Wyróżnione słowo jest podświetlane przez wyszukanie go w tytule
      // (case-insensitive) — jeśli DE nie będzie podłańcuchem DE tytułu,
      // podświetlenie po prostu zniknie. Wiążemy je z tytułem przez `ref`,
      // żeby validate.mjs mógł to sprawdzić bez zgadywania po ctx.
      const plTitle = str(r.title);
      const ref = { slideId: r.id };
      if (nonEmpty(plTitle)) ref.titleKey = unitKey("slide_title", plTitle);
      if (nonEmpty(r.title_de)) ref.titleDe = str(r.title_de);
      out.push(
        unit(
          "slide_highlight",
          str(r.highlighted_word),
          `slajd ${no}: wyróżnione słowo — MUSI być podłańcuchem (bez rozróżniania wielkości liter) przetłumaczonego tytułu tego slajdu`,
          ref
        )
      );
    }
    push(
      needsDe(r.cta_primary_label, r.cta_primary_label_de, force),
      "slide_cta",
      r.cta_primary_label,
      `slajd ${no}: etykieta przycisku głównego (krótka)`
    );
    push(
      needsDe(r.cta_secondary_label, r.cta_secondary_label_de, force),
      "slide_cta",
      r.cta_secondary_label,
      `slajd ${no}: etykieta przycisku dodatkowego (krótka)`
    );
    push(needsDe(r.image_alt, r.image_alt_de, force), "slide_alt", r.image_alt, `slajd ${no}: alt zdjęcia`);
  });

  for (const r of misc?.home_tiles ?? []) {
    push(needsDe(r.label, r.label_de, force), "tile_label", r.label, "kafelek na stronie głównej: etykieta");
    push(
      needsDe(r.description, r.description_de, force),
      "tile_description",
      r.description,
      `kafelek „${r.label}": opis`
    );
    push(
      needsDe(r.image_alt, r.image_alt_de, force),
      "tile_alt",
      r.image_alt,
      `kafelek „${r.label}": alt zdjęcia`
    );
  }

  for (const r of misc?.site_texts ?? []) {
    push(needsDe(r.value, r.value_de, force), "site_text", r.value, `tekst serwisu, klucz: ${r.key}`);
  }

  for (const r of misc?.pages ?? []) {
    push(needsDe(r.title, r.title_de, force), "page_title", r.title, `tytuł podstrony /${r.slug}`);
    push(
      needsDe(r.seo_description, r.seo_description_de, force),
      "page_seo",
      r.seo_description,
      `opis SEO podstrony /${r.slug} (meta description, trzymaj ~150–160 znaków)`
    );
  }

  for (const r of misc?.page_blocks ?? []) {
    const c = r?.content ?? {};
    const where = `blok „${r.block_type}" na podstronie /${r.page_slug ?? "?"}`;
    push(needsDe(c.heading, c.heading_de, force), "block_heading", c.heading, `${where}: nagłówek`);
    push(
      needsDe(c.subheading, c.subheading_de, force),
      "block_subheading",
      c.subheading,
      `${where}: podnagłówek`
    );
    push(needsDe(c.body, c.body_de, force), "block_body", c.body, `${where}: treść (HTML — zachowaj tagi)`);
    push(
      needsDe(c.cta_label, c.cta_label_de, force),
      "block_cta",
      c.cta_label,
      `${where}: etykieta przycisku (krótka)`
    );
    const items = Array.isArray(c.items) ? c.items : [];
    items.forEach((it, i) => {
      const no = i + 1;
      push(needsDe(it?.question, it?.question_de, force), "faq_question", it?.question, `${where}: pytanie FAQ ${no}`);
      push(
        needsDe(it?.answer, it?.answer_de, force),
        "faq_answer",
        it?.answer,
        `${where}: odpowiedź FAQ ${no} (HTML — zachowaj tagi)`
      );
      push(needsDe(it?.quote, it?.quote_de, force), "review_quote", it?.quote, `${where}: cytat z opinii ${no}`);
    });
  }

  return out;
}

// Dedup po kluczu, zachowując kolejność i PIERWSZE wystąpienie (razem z jego
// ctx/ref — kolejne konteksty i tak nie zmieniają treści do przetłumaczenia).
export function dedupeUnits(units) {
  const seen = new Set();
  const out = [];
  for (const u of units) {
    if (seen.has(u.key)) continue;
    seen.add(u.key);
    out.push(u);
  }
  return out;
}

// ── partie ────────────────────────────────────────────────────────────────
// Zachłanne pakowanie po długości tekstu. Jednostka dłuższa niż limit ląduje
// SAMA w swojej partii (inaczej nie dałoby się jej w ogóle zapakować).
export function packBatches(units, limit) {
  const batches = [];
  let cur = [];
  let size = 0;
  const flush = () => {
    if (cur.length > 0) batches.push(cur);
    cur = [];
    size = 0;
  };
  for (const u of units) {
    const len = str(u?.text).length;
    if (len > limit) {
      flush();
      batches.push([u]);
      continue;
    }
    if (cur.length > 0 && size + len > limit) flush();
    cur.push(u);
    size += len;
  }
  flush();
  return batches;
}

// ── składanie DE ──────────────────────────────────────────────────────────
// LUSTRO buildDeSections z TranslationEditor.tsx. Wynik ma DOKŁADNIE tyle
// sekcji co PL, ten sam `kind`, ten sam image_url/flagi; tłumaczenia wchodzą
// w title/body/image_alt/caption. admin_title/admin_body NIE MOGĄ trafić do
// DE — render liczy `admin_title || title`, więc przesłoniłyby niemiecki tekst.
// Brak tłumaczenia pod kluczem = pusty string (jak w edytorze).
export function assembleDeSections(plSections, translations) {
  const list = Array.isArray(plSections) ? plSections : [];
  const t = (kind, text) => (nonEmpty(text) ? lookupTranslation(translations, unitKey(kind, text)) ?? "" : "");
  return list.map((plSection) => {
    if (plSection?.kind === "image") {
      const out = {
        kind: "image",
        image_url: str(plSection.image_url),
        image_alt: t("image_alt", str(plSection.image_alt)),
      };
      const caption = t("caption", str(plSection.caption));
      if (caption !== "") out.caption = caption;
      // display to prezentacja, nie tłumaczenie — lustrzane z PL.
      if (plSection.display) out.display = plSection.display;
      return out;
    }
    const { title, body } = visibleTextSection(plSection);
    const out = {
      kind: "text",
      title: t("section_title", title),
      body: t("section_body", body),
    };
    if (plSection?.hidden !== undefined) out.hidden = plSection.hidden;
    if (plSection?.admin_custom !== undefined) out.admin_custom = plSection.admin_custom;
    return out;
  });
}

// Lista kluczy, których brakuje, żeby produkt dało się ZAPISAĆ w komplecie.
// Kompletny = każda widoczna sekcja tekstowa ma body (i title, gdy PL title
// niepusty), każda sekcja image z niepustym altem PL ma alt DE, plus name_de.
export function missingProductKeys(product, translations) {
  const missing = [];
  const need = (kind, text, label) => {
    if (!nonEmpty(text)) return;
    const key = unitKey(kind, text);
    if (!nonEmpty(lookupTranslation(translations, key))) missing.push({ key, kind, label });
  };
  need("product_name", str(product?.name), "nazwa produktu");
  const sections = Array.isArray(product?.description_sections) ? product.description_sections : [];
  sections.forEach((s, i) => {
    const no = i + 1;
    if (s?.kind === "image") {
      need("image_alt", str(s.image_alt), `alt zdjęcia, sekcja ${no}`);
      return;
    }
    const { title, body } = visibleTextSection(s);
    need("section_title", title, `tytuł sekcji ${no}`);
    need("section_body", body, `treść sekcji ${no}`);
  });
  return missing;
}

// ── page_blocks.content ───────────────────────────────────────────────────
// Dokleja klucze `*_de` do jsonb bloku, ZACHOWUJĄC wszystko pozostałe
// (layout, image_url, cta_href, limit, source, product_ids…). `items` łączone
// PO INDEKSIE. Bez `force` nie nadpisuje już istniejących niepustych `_de`.
export function mergeBlockContentDe(content, de, { force = false } = {}) {
  const src = content && typeof content === "object" ? content : {};
  const out = { ...src };
  const setDe = (target, source, field, value) => {
    if (!nonEmpty(value)) return;
    if (!force && nonEmpty(source?.[`${field}_de`])) return;
    target[`${field}_de`] = str(value);
  };
  for (const field of ["heading", "subheading", "body", "cta_label"]) {
    setDe(out, src, field, de?.[field]);
  }
  if (Array.isArray(src.items)) {
    const deItems = Array.isArray(de?.items) ? de.items : [];
    out.items = src.items.map((it, i) => {
      const item = it && typeof it === "object" ? { ...it } : it;
      if (!item || typeof item !== "object") return it;
      const d = deItems[i];
      if (!d) return item;
      for (const field of ["question", "answer", "quote"]) {
        setDe(item, it, field, d?.[field]);
      }
      return item;
    });
  }
  return out;
}

// ── walidatory ────────────────────────────────────────────────────────────
// Sekwencja NAZW tagów HTML (z otwierających i zamykających, kolejność ma
// znaczenie). Tłumacz, który zgubi <strong> albo przestawi <li>, zostanie
// złapany tutaj — a to najczęstszy sposób na rozwalenie layoutu sekcji.
export function tagSequence(html) {
  const out = [];
  const re = /<\s*\/?\s*([a-zA-Z][a-zA-Z0-9]*)/g;
  let m;
  while ((m = re.exec(str(html))) !== null) out.push(m[1].toLowerCase());
  return out;
}

// Polskie znaki diakrytyczne — w tekście DE to zawsze błąd (nieprzetłumaczony
// fragment). „ć/Ć" jest w klasie mimo że w pierwotnej specyfikacji go nie było:
// niemiecki nie używa tej litery, więc dorzucenie jej tylko wzmacnia kontrolę.
const POLISH_RE = /[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/;

export function hasPolishLetters(s) {
  return POLISH_RE.test(str(s));
}

// Słowa zawierające polskie znaki — do pokazania w raporcie.
export function polishWords(s) {
  const words = str(s)
    .replace(/<[^>]*>/g, " ")
    .split(/[^\p{L}\p{N}-]+/u)
    .filter((w) => w.length > 0 && POLISH_RE.test(w));
  return Array.from(new Set(words));
}

// Multizbiór tokenów liczbowych (posortowany) — wymiary, ceny, lata gwarancji.
export function numberTokens(s) {
  const found = str(s).match(/\d+(?:[.,]\d+)?/g) ?? [];
  return found.slice().sort();
}

// Zbiór URL-i. `https?://\S+` ucięty na pierwszym z znaków " ' < > — bo w HTML
// adres siedzi w atrybucie (href="https://…">) i \S+ wciąga ogon znaczników.
export function urls(s) {
  const found = str(s).match(/https?:\/\/\S+/g) ?? [];
  const cleaned = found.map((u) => u.split(/["'<>]/)[0]).filter((u) => u.length > 0);
  return Array.from(new Set(cleaned)).sort();
}

function sameList(a, b) {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

// Walidacja jednej jednostki. `de` = tekst zwrócony przez agenta.
// `opts.titleDe` — tylko dla slide_highlight: przetłumaczony tytuł slajdu.
export function validateUnit(unit, de, opts = {}) {
  const errors = [];
  const warnings = [];
  const pl = str(unit?.text);

  if (de === undefined || de === null) {
    errors.push("brak wyniku dla klucza");
    return { errors, warnings };
  }
  if (typeof de !== "string") {
    errors.push(`wynik nie jest stringiem (${typeof de})`);
    return { errors, warnings };
  }
  if (de.trim() === "") {
    errors.push("pusty wynik");
    return { errors, warnings };
  }

  const tagsPl = tagSequence(pl);
  const tagsDe = tagSequence(de);
  if (!sameList(tagsPl, tagsDe)) {
    errors.push(`inna sekwencja tagów HTML: PL [${tagsPl.join(",")}] vs DE [${tagsDe.join(",")}]`);
  }

  const urlsPl = urls(pl);
  const urlsDe = urls(de);
  if (!sameList(urlsPl, urlsDe)) {
    errors.push(`inny zbiór URL-i: PL [${urlsPl.join(" ")}] vs DE [${urlsDe.join(" ")}]`);
  }

  if (hasPolishLetters(de)) {
    errors.push(`polskie znaki w DE: ${polishWords(de).join(", ")}`);
  }

  if (unit?.kind === "slide_highlight") {
    const titleDe = opts.titleDe;
    if (typeof titleDe === "string" && titleDe.trim() !== "") {
      if (!titleDe.toLowerCase().includes(de.toLowerCase())) {
        errors.push(`wyróżnione słowo „${de}" nie występuje w tytule slajdu „${titleDe}"`);
      }
    } else {
      warnings.push("nie da się sprawdzić wyróżnionego słowa — brak przetłumaczonego tytułu slajdu");
    }
  }

  if (de === pl && pl.length > 20 && /\p{L}/u.test(pl)) {
    warnings.push("DE identyczne z PL (tekst >20 znaków) — prawdopodobnie nieprzetłumaczone");
  }

  if (pl.length > 0) {
    const ratio = de.length / pl.length;
    if (ratio < 0.6 || ratio > 1.9) {
      warnings.push(`podejrzana długość: ${pl.length} → ${de.length} znaków (×${ratio.toFixed(2)})`);
    }
  }

  const numsPl = numberTokens(pl);
  const numsDe = numberTokens(de);
  if (!sameList(numsPl, numsDe)) {
    warnings.push(`inne liczby: PL [${numsPl.join(",")}] vs DE [${numsDe.join(",")}]`);
  }

  return { errors, warnings };
}
