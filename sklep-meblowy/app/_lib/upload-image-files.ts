import { compressIfNeeded } from "./image-compress";
import { uploadProductImage } from "@/app/admin/produkty/actions";

// Wgrywa wiele plików naraz: dla każdego kompresja (>800KB) + upload przez
// istniejącą akcję serwerową uploadProductImage (jeden plik na wywołanie).
// Uploady lecą z ograniczoną równoległością — szybciej niż sekwencyjnie, bez
// zalewania serwera. Kolejność URL-i w wyniku odpowiada kolejności `files`.
// Serwer bez zmian: reużywamy akcji jeden-plik N razy (zachowana walidacja
// formatu/rozmiaru, nazwy i service_role).

export type UploadFailure = { name: string; error: string };
export type UploadImagesResult = { urls: string[]; failures: UploadFailure[] };

export async function uploadImageFiles(
  files: File[],
  opts: {
    onProgress?: (done: number, total: number) => void;
    concurrency?: number;
  } = {}
): Promise<UploadImagesResult> {
  const { onProgress, concurrency = 3 } = opts;
  const list = Array.from(files);
  const total = list.length;

  // Wynik indeksowany pozycją pliku → zachowujemy kolejność mimo równoległości.
  const slots: (string | null)[] = new Array(total).fill(null);
  const failures: UploadFailure[] = [];
  let done = 0;
  let cursor = 0;

  async function worker() {
    for (;;) {
      const i = cursor++;
      if (i >= total) return;
      const file = list[i];
      try {
        const toSend = await compressIfNeeded(file);
        const fd = new FormData();
        fd.set("image", toSend, toSend.name);
        const res = await uploadProductImage(fd);
        if (res.ok) {
          const url = (res.data as { url: string } | undefined)?.url;
          if (url) slots[i] = url;
          else failures.push({ name: file.name, error: "Brak URL po uploadzie" });
        } else {
          failures.push({ name: file.name, error: res.error });
        }
      } catch (err) {
        failures.push({
          name: file.name,
          error: err instanceof Error ? err.message : "Nieznany błąd uploadu",
        });
      } finally {
        done += 1;
        onProgress?.(done, total);
      }
    }
  }

  const poolSize = Math.min(Math.max(1, concurrency), total || 1);
  await Promise.all(Array.from({ length: poolSize }, () => worker()));

  return {
    urls: slots.filter((u): u is string => u !== null),
    failures,
  };
}
