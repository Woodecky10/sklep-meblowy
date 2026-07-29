// Normalizacja tekstu do porównań w wyszukiwarkach (filtr listy produktów
// w adminie): małe litery, bez diakrytyków, bez skrajnych spacji — „lozko"
// znajduje „Łóżko". NFD rozkłada ą/ę/ó/ś/ż/ź/ć/ń na literę + znak łączący
// (zdejmowany regexem), ale ł/Ł NIE ma dekompozycji w Unicode — mapujemy
// jawnie (po toLowerCase wystarczy „ł").
export function normalizeSearchText(input: string): string {
  return input
    .toLowerCase()
    .replace(/ł/g, "l")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

// Dopasowanie odporne na spacje i kolejność słów: normalizujemy obie strony
// (małe litery, bez diakrytyków — przez normalizeSearchText), z „siana" usuwamy
// WSZYSTKIE spacje, frazę tniemy na słowa; trafienie = każde słowo jest
// podłańcuchem odspacjowanego siana. Pusta fraza → true (nie zawęża).
export function searchMatches(haystack: string, query: string): boolean {
  const key = normalizeSearchText(haystack).replace(/\s+/g, "");
  const tokens = normalizeSearchText(query).split(/\s+/).filter(Boolean);
  return tokens.every((t) => key.includes(t));
}
