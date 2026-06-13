import { describe, it, expect } from "vitest";
import { runTranslationSweep } from "@/app/_lib/translation-sweep";

describe("runTranslationSweep", () => {
  it("kategoryzuje translated/failed i liczy", async () => {
    const items = [{ id: "a" }, { id: "b" }, { id: "c" }];
    const res = await runTranslationSweep(items, async (it) => {
      if (it.id === "b") throw new Error("DeepL down");
    });
    expect(res.translated).toBe(2);
    expect(res.failed).toBe(1);
    expect(res.scanned).toBe(3);
    expect(res.backlog).toBe(false);
  });
  it("backlog=true gdy itemów = limitowi (może być więcej)", async () => {
    const items = [{ id: "a" }, { id: "b" }];
    const res = await runTranslationSweep(items, async () => {}, { limitReached: true });
    expect(res.backlog).toBe(true);
  });
  it("błąd jednego itemu nie przerywa pętli", async () => {
    const seen: string[] = [];
    await runTranslationSweep([{ id: "a" }, { id: "b" }], async (it) => {
      seen.push(it.id);
      if (it.id === "a") throw new Error("x");
    });
    expect(seen).toEqual(["a", "b"]);
  });
});
