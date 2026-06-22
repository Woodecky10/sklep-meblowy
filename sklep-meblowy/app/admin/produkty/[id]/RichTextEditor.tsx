// app/admin/produkty/[id]/RichTextEditor.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import TextAlign from "@tiptap/extension-text-align";
// W TipTap 3.x TextStyle i Color są eksportowane z @tiptap/extension-text-style
import { TextStyle, Color } from "@tiptap/extension-text-style";
import Highlight from "@tiptap/extension-highlight";
import Image from "@tiptap/extension-image";
import { normalizeEditorHtml } from "@/app/_lib/rich-text";
import { uploadProductImage } from "../actions";
import { compressIfNeeded } from "./_shared";

type RichTextEditorProps = {
  value: string;
  onChange: (html: string) => void;
  ariaLabel: string;
  placeholder?: string;
};

// Stała paleta kolorów tekstu (UI ogranicza wybór; sanitizer i tak waliduje wartość).
const TEXT_COLORS = ["#1f2937", "#b91c1c", "#15803d", "#1d4ed8", "#b45309", "#7c3aed"];

// Edytor WYSIWYG opisu produktu. Wyjście = HTML zgodny z whitelistą
// sanitizeProductHtml (p/br/ul/ol/li/strong/em/a/h2/h3/h4/u/s/mark/blockquote +
// style text-align/color). Treść dostaje klasę `product-description`, więc
// w panelu wygląda 1:1 jak na karcie produktu.
//
// immediatelyRender:false — WYMÓG SSR Next 16 (inaczej hydration mismatch dla
// contentEditable). StarterKit 3.x bundluje Link i Underline — konfigurujemy
// je TUTAJ przez StarterKit.configure(). Osobne importy Underline i Link
// usunięte (duplikaty).
export default function RichTextEditor({
  value,
  onChange,
  ariaLabel,
  placeholder,
}: RichTextEditorProps) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        // H2, H3, H4 — rozszerzono o poziom 4
        heading: { levels: [2, 3, 4] },
        codeBlock: false,
        horizontalRule: false,
        code: false,
        // strike i blockquote włączone (usunięto: false)
        // StarterKit 3.x bundluje Underline — konfigurujemy tutaj, NIE importujemy osobno
        underline: {},
        // StarterKit 3.x bundluje Link — konfigurujemy go tutaj bezpośrednio
        link: {
          openOnClick: false,
          autolink: true,
          protocols: ["http", "https", "mailto", "tel"],
          HTMLAttributes: { rel: "noopener nofollow" },
        },
      }),
      Placeholder.configure({ placeholder: placeholder ?? "" }),
      TextAlign.configure({
        types: ["heading", "paragraph"],
        alignments: ["left", "center", "right", "justify"],
      }),
      TextStyle,
      Color,
      Highlight, // bez multicolor -> zwykły <mark>
      Image.configure({ inline: false, allowBase64: false }),
    ],
    content: value || "",
    onUpdate: ({ editor }) => onChange(normalizeEditorHtml(editor.getHTML())),
    editorProps: {
      attributes: {
        "aria-label": ariaLabel,
        class:
          "product-description min-h-[140px] px-3 py-2 focus:outline-none",
      },
    },
  });

  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadingImg, setUploadingImg] = useState(false);

  // Upload pliku → kompresja → Supabase storage → wstaw <img> w pozycji kursora.
  async function handleInsertImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !editor) return;
    setUploadingImg(true);
    try {
      const compressed = await compressIfNeeded(file);
      const fd = new FormData();
      fd.set("image", compressed, compressed.name);
      const res = await uploadProductImage(fd);
      if (!res.ok) { window.alert("Upload nieudany: " + res.error); return; }
      const url = (res.data as { url: string } | undefined)?.url;
      if (!url) { window.alert("Brak URL po uploadzie"); return; }
      editor.chain().focus().setImage({ src: url, alt: "" }).run();
    } finally {
      setUploadingImg(false);
    }
  }

  // Synchronizuj zewnętrzną zmianę `value` z edytorem (np. reset formularza,
  // załadowanie danych async). Porównujemy znormalizowany HTML, żeby NIE
  // wywoływać setContent podczas zwykłego pisania (onUpdate -> onChange ->
  // value nie zmienia się naprawdę). emitUpdate:false blokuje pętlę
  // onUpdate → onChange → value → effect → setContent → onUpdate.
  useEffect(() => {
    if (!editor) return;
    if (normalizeEditorHtml(editor.getHTML()) !== value) {
      editor.commands.setContent(value || "", { emitUpdate: false });
    }
  }, [value, editor]);

  if (!editor) return null;

  const btn = (active: boolean) =>
    `px-2 py-1 rounded text-xs font-sans transition-colors ${
      active
        ? "bg-[var(--color-navy)] text-white"
        : "bg-[var(--bg)] text-[var(--fg)] hover:bg-[var(--border)]"
    }`;

  function addLink() {
    const prev = editor!.getAttributes("link").href as string | undefined;
    const url = window.prompt("Adres linku (https://… / mailto:… / tel:…):", prev ?? "");
    if (url === null) return; // anulowano
    if (url.trim() === "") {
      editor!.chain().focus().unsetLink().run();
      return;
    }
    if (!/^(https?:|mailto:|tel:)/i.test(url.trim())) {
      window.alert("Dozwolone tylko linki http(s):, mailto: lub tel:");
      return;
    }
    editor!.chain().focus().extendMarkRange("link").setLink({ href: url.trim() }).run();
  }

  return (
    <div className="border border-[var(--border)] rounded-lg bg-[var(--bg)] overflow-hidden">
      <div className="flex flex-wrap items-center gap-1 px-2 py-1.5 border-b border-[var(--border)] bg-[var(--card-bg)]">
        {/* Formatowanie znakowe */}
        <button type="button" onClick={() => editor.chain().focus().toggleBold().run()} className={btn(editor.isActive("bold"))} aria-label="Pogrubienie"><strong>B</strong></button>
        <button type="button" onClick={() => editor.chain().focus().toggleItalic().run()} className={btn(editor.isActive("italic"))} aria-label="Kursywa"><em>I</em></button>
        <button type="button" onClick={() => editor.chain().focus().toggleUnderline().run()} className={btn(editor.isActive("underline"))} aria-label="Podkreślenie"><u>U</u></button>
        <button type="button" onClick={() => editor.chain().focus().toggleStrike().run()} className={btn(editor.isActive("strike"))} aria-label="Przekreślenie"><s>S</s></button>
        <span className="w-px h-5 bg-[var(--border)] mx-1" />
        {/* Listy i cytat */}
        <button type="button" onClick={() => editor.chain().focus().toggleBulletList().run()} className={btn(editor.isActive("bulletList"))} aria-label="Lista punktowana">• Lista</button>
        <button type="button" onClick={() => editor.chain().focus().toggleOrderedList().run()} className={btn(editor.isActive("orderedList"))} aria-label="Lista numerowana">1. Lista</button>
        <button type="button" onClick={() => editor.chain().focus().toggleBlockquote().run()} className={btn(editor.isActive("blockquote"))} aria-label="Cytat">❝</button>
        <span className="w-px h-5 bg-[var(--border)] mx-1" />
        {/* Nagłówki */}
        <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} className={btn(editor.isActive("heading", { level: 2 }))} aria-label="Nagłówek H2">H2</button>
        <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} className={btn(editor.isActive("heading", { level: 3 }))} aria-label="Nagłówek H3">H3</button>
        <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 4 }).run()} className={btn(editor.isActive("heading", { level: 4 }))} aria-label="Nagłówek H4">H4</button>
        <span className="w-px h-5 bg-[var(--border)] mx-1" />
        {/* Wyrównanie */}
        <button type="button" onClick={() => editor.chain().focus().setTextAlign("left").run()} className={btn(editor.isActive({ textAlign: "left" }))} aria-label="Do lewej">⯇</button>
        <button type="button" onClick={() => editor.chain().focus().setTextAlign("center").run()} className={btn(editor.isActive({ textAlign: "center" }))} aria-label="Wyśrodkuj">≡</button>
        <button type="button" onClick={() => editor.chain().focus().setTextAlign("right").run()} className={btn(editor.isActive({ textAlign: "right" }))} aria-label="Do prawej">⯈</button>
        <button type="button" onClick={() => editor.chain().focus().setTextAlign("justify").run()} className={btn(editor.isActive({ textAlign: "justify" }))} aria-label="Wyjustuj">≣</button>
        <span className="w-px h-5 bg-[var(--border)] mx-1" />
        {/* Kolor tekstu — stała paleta */}
        {TEXT_COLORS.map((col) => (
          <button key={col} type="button" onClick={() => editor.chain().focus().setColor(col).run()} aria-label={"Kolor " + col} title={"Kolor " + col} className="w-5 h-5 rounded-full border border-[var(--border)]" style={{ backgroundColor: col }} />
        ))}
        <button type="button" onClick={() => editor.chain().focus().unsetColor().run()} className={btn(false)} aria-label="Domyślny kolor">A</button>
        <button type="button" onClick={() => editor.chain().focus().toggleHighlight().run()} className={btn(editor.isActive("highlight"))} aria-label="Wyróżnienie">🖍</button>
        <span className="w-px h-5 bg-[var(--border)] mx-1" />
        {/* Link i obraz */}
        <button type="button" onClick={addLink} className={btn(editor.isActive("link"))} aria-label="Wstaw link">🔗</button>
        <button type="button" onClick={() => fileRef.current?.click()} disabled={uploadingImg} className={btn(false)} aria-label="Wstaw obraz">{uploadingImg ? "…" : "🖼"}</button>
        <input ref={fileRef} type="file" accept="image/*" onChange={handleInsertImage} className="hidden" />
        <span className="w-px h-5 bg-[var(--border)] mx-1" />
        {/* Historia i reset */}
        <button type="button" onClick={() => editor.chain().focus().undo().run()} className={btn(false)} aria-label="Cofnij">↶</button>
        <button type="button" onClick={() => editor.chain().focus().redo().run()} className={btn(false)} aria-label="Ponów">↷</button>
        <button type="button" onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()} className={btn(false)} aria-label="Wyczyść formatowanie">✕</button>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
