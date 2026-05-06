import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dostawa i płatności",
  description: "Informacje o sposobach dostawy, kosztach wysyłki i formach płatności.",
};

export default function DostawaPage() {
  return (
    <>
      <h1>Dostawa i płatności</h1>
      <span className="meta">Wszystko, co musisz wiedzieć o zamówieniu</span>

      <h2>Formy płatności</h2>
      <ul>
        <li>
          <strong>Karta płatniczna</strong> – Visa, Mastercard. Natychmiastowa autoryzacja.
        </li>
        <li>
          <strong>BLIK</strong> – potwierdzenie 6-cyfrowym kodem z aplikacji banku.
        </li>
        <li>
          <strong>Szybki przelew (Przelewy24)</strong> – automatyczne przekierowanie do Twojego
          banku.
        </li>
      </ul>
      <p>
        Wszystkie transakcje zabezpieczone są certyfikatem SSL. Nie przechowujemy numerów kart
        płatniczych – obsługuje je operator płatności.
      </p>

      <h2>Koszty i czas dostawy</h2>
      <ul>
        <li>
          <strong>Koszt dostawy:</strong> 299 zł (stała stawka, niezależnie od wartości zamówienia).
        </li>
        <li>
          <strong>Czas realizacji:</strong> od 7 do 35 dni roboczych, w zależności od produktu –
          szczegóły zawsze w karcie produktu.
        </li>
      </ul>
      <p>
        Czas realizacji liczymy od momentu zaksięgowania płatności. Po skompletowaniu zamówienia
        kurier lub firma transportowa skontaktuje się z Tobą telefonicznie, aby ustalić dogodny
        termin dostawy.
      </p>

      <h2>Obszar dostawy</h2>
      <p>Dostarczamy na terenie całej Rzeczypospolitej Polskiej.</p>

      <h2>Jak przebiega dostawa</h2>
      <ol>
        <li>Po opłaceniu zamówienia otrzymujesz potwierdzenie e-mailem.</li>
        <li>Informujemy Cię o statusie realizacji (w przygotowaniu, wysłane, dostarczone).</li>
        <li>
          Dla produktów wielkogabarytowych – telefon od firmy transportowej z propozycją terminu
          dostawy.
        </li>
        <li>
          Podczas odbioru zalecamy sprawdzenie stanu opakowania w obecności kuriera. W razie
          widocznych uszkodzeń – sporządzenie protokołu szkody ułatwi ewentualną reklamację.
        </li>
      </ol>

      <h2>Co z wniesieniem mebli?</h2>
      <p>
        Standardowa dostawa obejmuje transport pod pierwsze drzwi budynku. Wniesienie mebli na
        konkretne piętro lub do mieszkania można zamówić dodatkowo – szczegóły podaj przy
        telefonicznym ustalaniu terminu dostawy.
      </p>

      <h2>Uszkodzenie w transporcie</h2>
      <p>
        Jeżeli produkt został uszkodzony w transporcie, prosimy o niezwłoczny kontakt pod adresem
        wskazanym w zakładce <a href="/kontakt">Kontakt</a>, najlepiej z dokumentacją fotograficzną
        i – jeśli to możliwe – protokołem szkody spisanym z kurierem. Rozpatrzymy sprawę w
        terminie 14 dni.
      </p>
    </>
  );
}
