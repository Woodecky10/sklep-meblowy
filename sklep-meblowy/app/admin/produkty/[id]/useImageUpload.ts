"use client";

import { useRef, useState } from "react";
import { uploadImageFiles } from "@/app/_lib/upload-image-files";
import { pluralForm } from "@/app/_lib/plural";
import type { Toast } from "./_shared";

// Wspólna logika dodawania wielu zdjęć naraz (multi-select + drag & drop) dla
// edytorów admina: galeria produktu, warianty, sekcje opisu. Zwraca gotowe
// `inputProps` (dla <input multiple>) i `dropProps` (do rozlania na dowolny
// kontener-strefę), plus stan `uploading`/`progressText`/`isDragging`. Każde
// miejsce trzyma własny styl przycisku — hook daje tylko zachowanie.

const ZDJECIE_FORMS = { one: "zdjęcie", few: "zdjęcia", many: "zdjęć" };

function isFileDrag(e: React.DragEvent): boolean {
  return Array.from(e.dataTransfer?.types ?? []).includes("Files");
}

export function useImageUpload({
  onUploaded,
  onToast,
  successHint,
  concurrency = 3,
}: {
  onUploaded: (urls: string[]) => void;
  onToast: (t: Toast) => void;
  // Dopisek do toasta sukcesu, np. 'Kliknij „Zapisz zdjęcia” żeby utrwalić.'
  successHint?: string;
  concurrency?: number;
}) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  // Licznik zagnieżdżeń dragenter/dragleave — bez tego przejście kursora nad
  // dzieckiem strefy migało (dragleave z dziecka gasił podświetlenie).
  const dragDepth = useRef(0);

  async function handleFiles(fileList: FileList | File[] | null | undefined) {
    if (uploading) return;
    const all = Array.from(fileList ?? []);
    const files = all.filter((f) => f.type.startsWith("image/"));
    const skipped = all.length - files.length;

    if (files.length === 0) {
      if (skipped > 0) {
        onToast({ type: "error", message: "To nie są pliki graficzne — pominięto." });
      }
      return;
    }

    setUploading(true);
    setProgress({ done: 0, total: files.length });
    try {
      const { urls, failures } = await uploadImageFiles(files, {
        concurrency,
        onProgress: (done, total) => setProgress({ done, total }),
      });

      if (urls.length > 0) onUploaded(urls);

      if (failures.length === 0 && skipped === 0) {
        const form = pluralForm(urls.length, ZDJECIE_FORMS);
        onToast({
          type: "success",
          message: `Wgrano ${urls.length} ${form}.${successHint ? " " + successHint : ""}`,
        });
      } else {
        const parts: string[] = [];
        if (urls.length > 0) parts.push(`wgrano ${urls.length}`);
        if (failures.length > 0) parts.push(`nie udało się ${failures.length}`);
        if (skipped > 0) parts.push(`pominięto ${skipped} (nie-obraz)`);
        const detail = failures
          .slice(0, 3)
          .map((f) => `${f.name}: ${f.error}`)
          .join("; ");
        onToast({
          type: "error",
          message: `Zdjęcia — ${parts.join(", ")}.${detail ? " " + detail : ""}${
            failures.length > 3 ? " …" : ""
          }`,
        });
      }
    } finally {
      setUploading(false);
      setProgress(null);
      setIsDragging(false);
      dragDepth.current = 0;
    }
  }

  const progressText = progress ? `Wgrywam ${progress.done}/${progress.total}…` : null;

  const inputProps = {
    type: "file" as const,
    accept: "image/*",
    multiple: true,
    disabled: uploading,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      // e.target.files to ŻYWA FileList — skopiuj do tablicy PRZED
      // wyczyszczeniem inputu. `value = ""` opróżnia tę samą listę (referencję),
      // więc handleFiles dostawałby 0 plików → cichy no-op (bug: zdjęcia się
      // nie dodawały do galerii/wariantu/opisu, bez żadnego komunikatu).
      const files = Array.from(e.target.files ?? []);
      e.target.value = ""; // reset — ponowny wybór tych samych plików działa
      void handleFiles(files);
    },
  };

  const dropProps = {
    onDragEnter: (e: React.DragEvent) => {
      if (uploading || !isFileDrag(e)) return;
      e.preventDefault();
      dragDepth.current += 1;
      setIsDragging(true);
    },
    onDragOver: (e: React.DragEvent) => {
      if (uploading || !isFileDrag(e)) return;
      e.preventDefault();
    },
    onDragLeave: (e: React.DragEvent) => {
      if (uploading || !isFileDrag(e)) return;
      dragDepth.current -= 1;
      if (dragDepth.current <= 0) {
        dragDepth.current = 0;
        setIsDragging(false);
      }
    },
    onDrop: (e: React.DragEvent) => {
      if (uploading || !isFileDrag(e)) return;
      e.preventDefault();
      dragDepth.current = 0;
      setIsDragging(false);
      void handleFiles(e.dataTransfer?.files);
    },
  };

  return { uploading, progressText, isDragging, inputProps, dropProps };
}
