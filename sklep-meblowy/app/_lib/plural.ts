// Wybór formy rzeczownika po liczebniku — uproszczona polska pluralizacja
// (1 → one, 2-4 → few, reszta → many). Świadomie NIE obsługuje wyjątku 12-14
// (tam poprawnie byłoby "many"), bo taki był wzorzec w całej aplikacji i nie
// chcemy zmieniać widocznych etykiet. Dla niemieckiego few==many w słownikach,
// więc ta sama funkcja działa dla obu locale.
export function pluralForm(
  n: number,
  forms: { one: string; few: string; many: string }
): string {
  if (n === 1) return forms.one;
  if (n < 5) return forms.few;
  return forms.many;
}
