import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock akcji serwerowej (nie ładujemy prawdziwego "use server" z jego server-only
// zależnościami) oraz kompresji (zwraca plik bez zmian).
const { uploadMock } = vi.hoisted(() => ({ uploadMock: vi.fn() }));
vi.mock("@/app/admin/produkty/actions", () => ({
  uploadProductImage: uploadMock,
}));
vi.mock("@/app/_lib/image-compress", () => ({
  compressIfNeeded: (f: File) => Promise.resolve(f),
}));

import { uploadImageFiles } from "@/app/_lib/upload-image-files";

function file(name: string): File {
  return new File(["x"], name, { type: "image/jpeg" });
}
function nameOf(fd: FormData): string {
  const f = fd?.get?.("image") as File | null | undefined;
  return f?.name ?? "?";
}

beforeEach(() => uploadMock.mockReset());
// Czyścimy też PO teście — inaczej odrzucona obietnica trzymana w
// uploadMock.mock.results (test z throw) bywa raportowana jako unhandled
// rejection przy końcowym sweepie vitest, mimo że SUT ją łapie.
afterEach(() => uploadMock.mockReset());

describe("uploadImageFiles", () => {
  it("zachowuje kolejność URL-i mimo równoległości i różnych czasów zakończenia", async () => {
    // a kończy się najpóźniej, c najwcześniej (opóźnienie liczbą mikrozadań),
    // a mimo to wynik musi być a,b,c — bo kolejność trzymamy po indeksie.
    const ticks: Record<string, number> = { "a.jpg": 3, "b.jpg": 2, "c.jpg": 1 };
    uploadMock.mockImplementation(async (fd: FormData) => {
      const name = nameOf(fd);
      for (let k = 0; k < (ticks[name] ?? 0); k++) await Promise.resolve();
      return { ok: true, data: { url: `https://cdn/${name}` } };
    });

    const res = await uploadImageFiles([file("a.jpg"), file("b.jpg"), file("c.jpg")], {
      concurrency: 3,
    });

    expect(res.urls).toEqual([
      "https://cdn/a.jpg",
      "https://cdn/b.jpg",
      "https://cdn/c.jpg",
    ]);
    expect(res.failures).toEqual([]);
  });

  it("zbiera błędy i mimo to wgrywa pozostałe (częściowa porażka)", async () => {
    uploadMock.mockImplementation(async (fd: FormData) => {
      const name = nameOf(fd);
      if (name === "bad.jpg") return { ok: false, error: "za duży" };
      return { ok: true, data: { url: `https://cdn/${name}` } };
    });

    const res = await uploadImageFiles([file("a.jpg"), file("bad.jpg"), file("c.jpg")]);

    expect(res.urls).toEqual(["https://cdn/a.jpg", "https://cdn/c.jpg"]);
    expect(res.failures).toEqual([{ name: "bad.jpg", error: "za duży" }]);
  });

  it("traktuje sukces bez URL jako porażkę", async () => {
    uploadMock.mockResolvedValue({ ok: true, data: {} });

    const res = await uploadImageFiles([file("a.jpg")]);

    expect(res.urls).toEqual([]);
    expect(res.failures).toEqual([{ name: "a.jpg", error: "Brak URL po uploadzie" }]);
  });

  it("raportuje postęp done/total dla każdego pliku", async () => {
    uploadMock.mockResolvedValue({ ok: true, data: { url: "https://cdn/x" } });
    const prog: Array<[number, number]> = [];

    await uploadImageFiles([file("a.jpg"), file("b.jpg")], {
      concurrency: 1,
      onProgress: (done, total) => prog.push([done, total]),
    });

    expect(prog).toEqual([
      [1, 2],
      [2, 2],
    ]);
  });

  it("łapie wyjątek z akcji i zapisuje go w failures", async () => {
    uploadMock.mockImplementation(async () => {
      throw new Error("network down");
    });

    const res = await uploadImageFiles([file("a.jpg")]);

    expect(res.urls).toEqual([]);
    expect(res.failures).toEqual([{ name: "a.jpg", error: "network down" }]);
  });
});
