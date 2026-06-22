import { describe, it, expect } from "vitest";
import { normalizeEditorHtml } from "@/app/_lib/rich-text";

describe("normalizeEditorHtml — pusty edytor → pusty string", () => {
  it("pusty string", () => {
    expect(normalizeEditorHtml("")).toBe("");
  });
  it("pusty paragraf TipTap", () => {
    expect(normalizeEditorHtml("<p></p>")).toBe("");
  });
  it("paragraf z samym <br>", () => {
    expect(normalizeEditorHtml("<p><br></p>")).toBe("");
  });
  it("same białe znaki i &nbsp;", () => {
    expect(normalizeEditorHtml("<p>  &nbsp; </p>")).toBe("");
  });
  it("treść z listą → zwraca przycięty HTML", () => {
    expect(normalizeEditorHtml("<ul><li>Sofa</li></ul>")).toBe(
      "<ul><li>Sofa</li></ul>"
    );
  });
  it("treść z nagłówkiem i akapitem → bez zmian (trim)", () => {
    const html = "<h2>Opis</h2><p>Wygodna sofa.</p>";
    expect(normalizeEditorHtml(`  ${html}  `)).toBe(html);
  });
});
