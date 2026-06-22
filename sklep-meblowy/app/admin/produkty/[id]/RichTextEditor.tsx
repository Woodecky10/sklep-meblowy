// app/admin/produkty/[id]/RichTextEditor.tsx
"use client";

import { useEffect } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { normalizeEditorHtml } from "@/app/_lib/rich-text";

type RichTextEditorProps = {
  value: string;
  onChange: (html: string) => void;
  ariaLabel: string;
  placeholder?: string;
};

// Edytor WYSIWYG opisu produktu. Wyjście = HTML zgodny z whitelistą
// sanitizeProductHtml (p/br/ul/ol/li/strong/em/a/h2/h3). Treść dostaje klasę
// `product-description`, więc w panelu wygląda 1:1 jak na karcie produktu.
//
// immediatelyRender:false — WYMÓG SSR Next 16 (inaczej hydration mismatch dla
// contentEditable). StarterKit 3.x bundluje Link — konfigurujemy go TUTAJ
// przez StarterKit.configure({ link: {...} }). Osobny import Link usunięty.
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
        heading: { levels: [2, 3] },
        codeBlock: false,
        blockquote: false,
        horizontalRule: false,
        strike: false,
        code: false,
        // StarterKit 3.x bundluje Link — konfigurujemy go tutaj bezpośrednio
        link: {
          openOnClick: false,
          autolink: true,
          protocols: ["http", "https", "mailto", "tel"],
          HTMLAttributes: { rel: "noopener nofollow" },
        },
      }),
      Placeholder.configure({ placeholder: placeholder ?? "" }),
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
        <button type="button" onClick={() => editor.chain().focus().toggleBold().run()} className={btn(editor.isActive("bold"))} aria-label="Pogrubienie"><strong>B</strong></button>
        <button type="button" onClick={() => editor.chain().focus().toggleItalic().run()} className={btn(editor.isActive("italic"))} aria-label="Kursywa"><em>I</em></button>
        <span className="w-px h-5 bg-[var(--border)] mx-1" />
        <button type="button" onClick={() => editor.chain().focus().toggleBulletList().run()} className={btn(editor.isActive("bulletList"))} aria-label="Lista punktowana">• Lista</button>
        <button type="button" onClick={() => editor.chain().focus().toggleOrderedList().run()} className={btn(editor.isActive("orderedList"))} aria-label="Lista numerowana">1. Lista</button>
        <span className="w-px h-5 bg-[var(--border)] mx-1" />
        <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} className={btn(editor.isActive("heading", { level: 2 }))} aria-label="Nagłówek H2">H2</button>
        <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} className={btn(editor.isActive("heading", { level: 3 }))} aria-label="Nagłówek H3">H3</button>
        <span className="w-px h-5 bg-[var(--border)] mx-1" />
        <button type="button" onClick={addLink} className={btn(editor.isActive("link"))} aria-label="Wstaw link">🔗 Link</button>
        <button type="button" onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()} className={btn(false)} aria-label="Wyczyść formatowanie">✕ Wyczyść</button>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
