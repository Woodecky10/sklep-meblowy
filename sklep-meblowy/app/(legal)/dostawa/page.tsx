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

      <h2>Koszt dostawy</h2>
      <p>
        Koszt dostawy mieści się w przedziale <strong>99–599 zł</strong> i zależy od wagi,
        gabarytów oraz miejsca dostawy:
      </p>
      <ul>
        <li>
          <strong>Materace, mniejsze meble</strong> – ok. <strong>99–199 zł</strong>
        </li>
        <li>
          <strong>Łóżka, sofy 2-osobowe</strong> – ok. <strong>199–399 zł</strong>
        </li>
        <li>
          <strong>Narożniki, łóżka kontynentalne, sofy 3-osobowe</strong> – ok.{" "}
          <strong>399–599 zł</strong>
        </li>
      </ul>
      <p>
        Dokładny koszt podajemy klientowi <strong>po złożeniu zamówienia</strong> drogą
        telefoniczną lub mailową, przed wysyłką. Klient akceptuje wycenę przed jej realizacją.
      </p>

      <h2>Czas dostawy</h2>
      <p>
        Czas realizacji jest podany w karcie każdego produktu. Liczymy go od momentu zaksięgowania
        płatności. Po skompletowaniu zamówienia kurier lub firma transportowa skontaktuje się z
        Tobą telefonicznie, aby ustalić dogodny termin dostawy.
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
