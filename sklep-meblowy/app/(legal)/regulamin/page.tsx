import type { Metadata } from "next";
import { COMPANY, formatFullAddress, isFilled } from "@/app/_lib/company";

export const metadata: Metadata = {
  title: "Regulamin sklepu",
  description: "Regulamin sklepu internetowego – zasady zawierania umów, dostawa, płatności, reklamacje.",
};

// UWAGA: To jest szablon zgodny z polskim prawem konsumenckim (ustawa o prawach
// konsumenta z 30.05.2014, RODO, ustawa o świadczeniu usług drogą elektroniczną).
// Przed uruchomieniem produkcji przejrzyj dokument — najlepiej z prawnikiem —
// i dostosuj punkty specyficzne dla Twojej działalności.

export default function RegulaminPage() {
  return (
    <>
      <h1>Regulamin sklepu internetowego</h1>
      <span className="meta">Obowiązuje od 1 stycznia 2026 r.</span>

      <h2>§ 1. Postanowienia ogólne</h2>
      <ol>
        <li>
          Niniejszy regulamin określa zasady korzystania ze sklepu internetowego dostępnego pod
          adresem <strong>{COMPANY.domain}</strong> (dalej: „Sklep").
        </li>
        <li>
          Właścicielem Sklepu jest <strong>{COMPANY.legalName}</strong> z siedzibą pod adresem{" "}
          {formatFullAddress()}, NIP: {COMPANY.nip}
          {isFilled(COMPANY.regon) && <>, REGON: {COMPANY.regon}</>}
          {COMPANY.krs && <>, KRS: {COMPANY.krs}</>}
          {" "}(dalej: „Sprzedawca").
        </li>
        <li>
          Kontakt ze Sprzedawcą: e-mail <strong>{COMPANY.email}</strong>
          {COMPANY.phone && <>, telefon {COMPANY.phone}</>}.
        </li>
        <li>
          Sklep prowadzi sprzedaż detaliczną mebli oraz akcesoriów wyposażenia wnętrz za
          pośrednictwem sieci Internet na terenie Rzeczypospolitej Polskiej.
        </li>
      </ol>

      <h2>§ 2. Definicje</h2>
      <ol>
        <li>
          <strong>Klient</strong> – osoba fizyczna, osoba prawna lub jednostka organizacyjna
          nieposiadająca osobowości prawnej, która dokonuje zakupu w Sklepie.
        </li>
        <li>
          <strong>Konsument</strong> – Klient będący osobą fizyczną, zawierający umowę niezwiązaną
          bezpośrednio z jego działalnością gospodarczą lub zawodową.
        </li>
        <li>
          <strong>Przedsiębiorca na prawach konsumenta</strong> – osoba fizyczna prowadząca
          działalność gospodarczą, zawierająca umowę bezpośrednio związaną z jej działalnością, gdy
          z jej treści wynika, że nie posiada ona dla niej charakteru zawodowego.
        </li>
        <li>
          <strong>Produkt</strong> – towar oferowany do sprzedaży w Sklepie.
        </li>
        <li>
          <strong>Zamówienie</strong> – oświadczenie woli Klienta, zmierzające bezpośrednio do
          zawarcia umowy sprzedaży Produktu.
        </li>
      </ol>

      <h2>§ 3. Składanie zamówień</h2>
      <ol>
        <li>
          Zamówienia można składać 24 godziny na dobę przez stronę Sklepu. Zamówienia złożone w
          dni robocze po godz. 12:00 oraz w dni wolne od pracy są przyjmowane do realizacji w
          najbliższym dniu roboczym.
        </li>
        <li>
          Złożenie zamówienia wymaga podania danych osobowych niezbędnych do realizacji umowy:
          imienia, nazwiska, adresu dostawy, numeru telefonu oraz adresu e-mail.
        </li>
        <li>
          W procesie składania zamówienia Klient potwierdza zapoznanie się z niniejszym
          regulaminem oraz akceptację jego postanowień.
        </li>
        <li>
          Zamówienie uważa się za złożone z chwilą otrzymania przez Klienta potwierdzenia jego
          przyjęcia na wskazany adres e-mail.
        </li>
        <li>
          Umowa sprzedaży zostaje zawarta z chwilą zaksięgowania płatności na rachunku bankowym
          Sprzedawcy lub operatora płatności.
        </li>
      </ol>

      <h2>§ 4. Ceny i płatności</h2>
      <ol>
        <li>
          Wszystkie ceny Produktów podane w Sklepie są cenami brutto (zawierają podatek VAT) i są
          wyrażone w złotych polskich (PLN).
        </li>
        <li>
          Cena Produktu nie zawiera kosztów dostawy, które są doliczane do ceny zamówienia
          i wyświetlane Klientowi przed złożeniem zamówienia.
        </li>
        <li>
          Klient może wybrać jedną z dostępnych w Sklepie form płatności:
          <ul>
            <li>płatność online kartą płatniczą,</li>
            <li>BLIK,</li>
            <li>szybki przelew (Przelewy24).</li>
          </ul>
        </li>
        <li>
          Sprzedawca wystawia paragon fiskalny lub – na życzenie Klienta zgłoszone w zamówieniu –
          fakturę VAT.
        </li>
      </ol>

      <h2>§ 5. Realizacja zamówienia i dostawa</h2>
      <ol>
        <li>
          Czas realizacji zamówienia liczy się od dnia zaksięgowania płatności i jest każdorazowo
          wskazany w karcie Produktu (zwykle od 7 do 35 dni roboczych, w zależności od Produktu).
        </li>
        <li>
          Dostawa odbywa się na terenie Rzeczypospolitej Polskiej za pośrednictwem firmy
          kurierskiej lub transportu meblowego (dla Produktów wielkogabarytowych).
        </li>
        <li>
          Koszty dostawy określone są w zakładce <a href="/dostawa">Dostawa i płatności</a>.
          Zamówienia o wartości powyżej 2000 zł są dostarczane bezpłatnie.
        </li>
        <li>
          Klient jest zobowiązany do sprawdzenia stanu przesyłki w obecności kuriera. W razie
          stwierdzenia uszkodzeń opakowania lub Produktu zaleca się sporządzenie protokołu szkody.
        </li>
      </ol>

      <h2>§ 6. Prawo odstąpienia od umowy</h2>
      <ol>
        <li>
          Konsument oraz Przedsiębiorca na prawach konsumenta mają prawo odstąpić od umowy w
          terminie 14 dni od dnia otrzymania Produktu, bez podawania przyczyny.
        </li>
        <li>
          Aby skorzystać z prawa odstąpienia, należy poinformować Sprzedawcę o swojej decyzji w
          formie jednoznacznego oświadczenia, wysłanego na adres e-mail{" "}
          <strong>{COMPANY.email}</strong> lub adres pocztowy Sprzedawcy.
        </li>
        <li>
          Klient może skorzystać z wzoru formularza odstąpienia dostępnego w zakładce{" "}
          <a href="/zwroty">Zwroty i reklamacje</a>.
        </li>
        <li>
          W przypadku odstąpienia od umowy, umowę uważa się za niezawartą. Sprzedawca zwraca
          Klientowi wszystkie otrzymane płatności, w tym koszty dostawy (z wyjątkiem dodatkowych
          kosztów wynikających z wybranego przez Klienta sposobu dostawy innego niż najtańszy
          oferowany przez Sklep), niezwłocznie, nie później niż 14 dni od dnia otrzymania
          oświadczenia o odstąpieniu.
        </li>
        <li>
          Klient ponosi bezpośrednie koszty zwrotu Produktu. W przypadku Produktów, których ze
          względu na ich gabaryty nie można odesłać zwykłą przesyłką, koszty te mogą być wyższe –
          szacunkowe koszty zwrotu wskazane są w karcie Produktu.
        </li>
        <li>
          Prawo odstąpienia nie przysługuje w przypadku Produktów wykonanych na indywidualne
          zamówienie Klienta (np. nietypowe wymiary, spersonalizowana tkanina), zgodnie z art. 38
          ustawy o prawach konsumenta.
        </li>
      </ol>

      <h2>§ 7. Reklamacje (rękojmia)</h2>
      <ol>
        <li>
          Sprzedawca ponosi odpowiedzialność wobec Konsumenta z tytułu rękojmi za wady Produktu
          przez okres 2 lat od dnia wydania Produktu, zgodnie z przepisami Kodeksu cywilnego.
        </li>
        <li>
          Reklamację można złożyć w formie elektronicznej (na adres <strong>{COMPANY.email}</strong>
          ) lub pisemnej (na adres Sprzedawcy).
        </li>
        <li>
          Zgłoszenie reklamacji powinno zawierać: dane Klienta, numer zamówienia, opis wady oraz
          żądanie Klienta (naprawa, wymiana, obniżenie ceny, odstąpienie od umowy).
        </li>
        <li>
          Sprzedawca rozpatruje reklamację w terminie 14 dni od dnia jej otrzymania i informuje
          Klienta o sposobie jej załatwienia.
        </li>
      </ol>

      <h2>§ 8. Pozasądowe sposoby rozpatrywania reklamacji</h2>
      <ol>
        <li>
          Konsument ma możliwość skorzystania z pozasądowych sposobów rozpatrywania reklamacji i
          dochodzenia roszczeń, w tym:
          <ul>
            <li>
              mediacji prowadzonej przez Wojewódzkie Inspektoraty Inspekcji Handlowej,
            </li>
            <li>stałych polubownych sądów konsumenckich,</li>
            <li>
              platformy internetowej ODR Komisji Europejskiej:{" "}
              <a
                href="https://ec.europa.eu/consumers/odr"
                target="_blank"
                rel="noopener noreferrer"
              >
                ec.europa.eu/consumers/odr
              </a>
              .
            </li>
          </ul>
        </li>
      </ol>

      <h2>§ 9. Ochrona danych osobowych</h2>
      <p>
        Zasady przetwarzania danych osobowych opisane są w odrębnym dokumencie:{" "}
        <a href="/prywatnosc">Polityce prywatności</a>.
      </p>

      <h2>§ 10. Postanowienia końcowe</h2>
      <ol>
        <li>
          W sprawach nieuregulowanych niniejszym regulaminem zastosowanie mają przepisy prawa
          polskiego, w szczególności Kodeksu cywilnego, ustawy o prawach konsumenta oraz ustawy o
          świadczeniu usług drogą elektroniczną.
        </li>
        <li>
          Sprzedawca zastrzega sobie prawo do zmiany regulaminu. Zmiany wchodzą w życie w terminie
          wskazanym przez Sprzedawcę, nie krótszym niż 7 dni od dnia publikacji na stronie Sklepu.
          Zmiany nie mają zastosowania do zamówień złożonych przed datą ich wejścia w życie.
        </li>
        <li>
          Ewentualne spory powstałe w związku z umową zawartą na podstawie niniejszego regulaminu
          będą rozstrzygane przez sąd powszechny właściwy dla miejsca zamieszkania Konsumenta, a
          w przypadku Klientów niebędących Konsumentami – przez sąd właściwy dla siedziby
          Sprzedawcy.
        </li>
      </ol>
    </>
  );
}
