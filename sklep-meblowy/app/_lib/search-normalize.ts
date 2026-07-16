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
