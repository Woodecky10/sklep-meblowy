import type { Metadata } from "next";
import { COMPANY, formatFullAddress } from "@/app/_lib/company";

export const metadata: Metadata = {
  title: "Polityka prywatności",
  description: "Zasady przetwarzania danych osobowych w sklepie internetowym, zgodnie z RODO.",
};

export default function PrywatnoscPage() {
  return (
    <>
      <h1>Polityka prywatności</h1>
      <span className="meta">Obowiązuje od 1 stycznia 2026 r.</span>

      <h2>§ 1. Administrator danych osobowych</h2>
      <p>
        Administratorem Twoich danych osobowych jest <strong>{COMPANY.legalName}</strong> z
        siedzibą pod adresem {formatFullAddress()}, NIP: {COMPANY.nip} (dalej: „Administrator”).
        Kontakt w sprawach ochrony danych: <strong>{COMPANY.email}</strong>.
      </p>

      <h2>§ 2. Jakie dane zbieramy i w jakim celu</h2>
      <p>Przetwarzamy następujące kategorie danych, w zależności od interakcji ze Sklepem:</p>
      <h3>a) Złożenie zamówienia</h3>
      <ul>
        <li>imię i nazwisko,</li>
        <li>adres dostawy,</li>
        <li>adres e-mail,</li>
        <li>numer telefonu (opcjonalnie, do kontaktu kuriera),</li>
        <li>w przypadku faktury: dane firmy i NIP.</li>
      </ul>
      <p>
        <strong>Cel:</strong> realizacja umowy sprzedaży (art. 6 ust. 1 lit. b RODO), wystawienie
        dokumentów księgowych (art. 6 ust. 1 lit. c RODO).
      </p>

      <h3>b) Założenie konta</h3>
      <ul>
        <li>adres e-mail i hasło (przechowywane w formie zaszyfrowanej),</li>
        <li>opcjonalnie: dane zapamiętane do szybszego składania kolejnych zamówień.</li>
      </ul>
      <p>
        <strong>Cel:</strong> świadczenie usługi konta (art. 6 ust. 1 lit. b RODO).
      </p>

      <h3>c) Obsługa płatności</h3>
      <p>
        Dane płatności (numer karty, dane transakcji) <strong>nie są przechowywane</strong> przez
        Sklep. Obsługuje je operator płatności <strong>PayPro S.A. (Przelewy24)</strong>, który
        jest odrębnym administratorem tych danych — szczegóły w § 9 niniejszej Polityki.
      </p>

      <h3>d) Korzystanie ze strony</h3>
      <ul>
        <li>adres IP,</li>
        <li>informacje o przeglądarce i systemie operacyjnym,</li>
        <li>pliki cookies (patrz § 6).</li>
      </ul>
      <p>
        <strong>Cel:</strong> prawidłowe działanie Sklepu, bezpieczeństwo, analityka (art. 6 ust. 1
        lit. f RODO – uzasadniony interes).
      </p>

      <h2>§ 3. Odbiorcy danych</h2>
      <p>Twoje dane osobowe mogą być przekazywane:</p>
      <ul>
        <li>
          <strong>Firmom kurierskim</strong> – w zakresie niezbędnym do dostawy (imię, nazwisko,
          adres, telefon).
        </li>
        <li>
          <strong>Operatorowi płatności</strong> PayPro S.A. (Przelewy24), ul. Pastelowa 8, 60-198
          Poznań, KRS 0000347935, NIP 7792369887 – w zakresie niezbędnym do realizacji transakcji
          (szczegóły w § 9).
        </li>
        <li>
          <strong>Dostawcom infrastruktury</strong> – Supabase (hosting bazy danych), Vercel
          (hosting aplikacji), Resend (wysyłka e-maili transakcyjnych).
        </li>
        <li>
          <strong>Biuru rachunkowemu</strong> – w zakresie niezbędnym do prowadzenia księgowości.
        </li>
        <li>
          <strong>Organom publicznym</strong> – wyłącznie gdy wynika to z obowiązku prawnego.
        </li>
      </ul>

      <h2>§ 4. Przekazywanie danych poza EOG</h2>
      <p>
        Część dostawców infrastruktury (Vercel) ma siedzibę poza Europejskim Obszarem
        Gospodarczym. Przekazanie danych odbywa się na podstawie standardowych klauzul umownych
        zatwierdzonych przez Komisję Europejską oraz decyzji o odpowiednim poziomie ochrony
        danych (EU-US Data Privacy Framework). Operator płatności PayPro S.A. (Przelewy24) ma
        siedzibę w Polsce — dane do operatora płatności nie są przekazywane poza EOG.
      </p>

      <h2>§ 5. Okres przechowywania danych</h2>
      <ul>
        <li>
          <strong>Dane zamówienia</strong> – przez 5 lat od końca roku kalendarzowego, w którym
          zrealizowano zamówienie (obowiązek podatkowy).
        </li>
        <li>
          <strong>Dane konta</strong> – do momentu usunięcia konta przez użytkownika.
        </li>
        <li>
          <strong>Dane marketingowe</strong> (jeśli wyraziłeś zgodę) – do momentu wycofania zgody.
        </li>
      </ul>

      <h2>§ 6. Pliki cookies</h2>
      <ol>
        <li>
          Sklep używa plików cookies (ciasteczek) w celu zapewnienia prawidłowego działania strony
          oraz analizy ruchu.
        </li>
        <li>
          Stosujemy następujące kategorie cookies:
          <ul>
            <li>
              <strong>Niezbędne</strong> – wymagane do działania Sklepu (np. utrzymanie sesji
              zalogowania, koszyk). Nie wymagają zgody.
            </li>
            <li>
              <strong>Analityczne</strong> – pomagają zrozumieć, jak użytkownicy korzystają ze
              strony. Wymagają zgody.
            </li>
            <li>
              <strong>Marketingowe</strong> – służą do prezentowania treści reklamowych. Wymagają
              zgody.
            </li>
          </ul>
        </li>
        <li>
          Możesz zarządzać cookies w ustawieniach przeglądarki oraz poprzez baner cookies
          wyświetlany przy pierwszej wizycie w Sklepie.
        </li>
      </ol>

      <h2>§ 7. Twoje prawa</h2>
      <p>W związku z przetwarzaniem Twoich danych osobowych masz prawo do:</p>
      <ul>
        <li>dostępu do treści swoich danych,</li>
        <li>sprostowania (poprawienia) danych,</li>
        <li>usunięcia danych („prawo do bycia zapomnianym”),</li>
        <li>ograniczenia przetwarzania,</li>
        <li>przenoszenia danych,</li>
        <li>
          wniesienia sprzeciwu wobec przetwarzania opartego na uzasadnionym interesie
          Administratora,
        </li>
        <li>wycofania zgody w dowolnym momencie (nie wpływa to na legalność wcześniejszego przetwarzania),</li>
        <li>
          wniesienia skargi do Prezesa Urzędu Ochrony Danych Osobowych (ul. Stawki 2, 00-193
          Warszawa).
        </li>
      </ul>
      <p>
        W sprawach związanych z Twoimi prawami skontaktuj się z nami pod adresem{" "}
        <strong>{COMPANY.email}</strong>.
      </p>

      <h2>§ 8. Zmiany polityki prywatności</h2>
      <p>
        Polityka prywatności może być aktualizowana. Data ostatniej aktualizacji wskazana jest
        na początku dokumentu. O istotnych zmianach poinformujemy użytkowników z aktywnym kontem
        drogą e-mailową.
      </p>

      <h2>§ 9. Dane przekazywane operatorowi płatności (Przelewy24)</h2>
      <p>
        W celu realizacji płatności za zamówienie udostępniamy operatorowi płatności następujące
        dane osobowe Klienta: <strong>adres e-mail, imię, nazwisko, adres</strong>. Dane te
        przekazywane są w zakresie niezbędnym do przeprowadzenia transakcji płatniczej.
      </p>
      <p>
        <strong>Odbiorca tych danych (odrębny administrator):</strong>
        <br />
        PayPro Spółka Akcyjna z siedzibą w Poznaniu, ul. Pastelowa 8, 60-198 Poznań, wpisana do
        Rejestru Przedsiębiorców Krajowego Rejestru Sądowego prowadzonego przez Sąd Rejonowy
        Poznań Nowe Miasto i Wilda w Poznaniu, VIII Wydział Gospodarczy KRS pod numerem KRS{" "}
        <strong>0000347935</strong>, NIP <strong>7792369887</strong>, REGON 301345068, krajowa
        instytucja płatnicza wpisana do rejestru KNF pod numerem IP24/2014.
      </p>
      <p>
        <strong>Cele przetwarzania danych przez PayPro:</strong> świadczenie usług płatniczych
        (przyjmowanie i rozliczanie płatności na rzecz Sklepu), w szczególności w zakresie
        niezbędnym do zapobiegania oszustwom związanym z wykonywanymi usługami płatniczymi oraz
        dochodzenia i wykrywania tego rodzaju oszustw, a także identyfikacji Płatnika w zakresie
        wynikającym z przepisów prawa (Ustawa o usługach płatniczych, Ustawa AML).
      </p>
      <p>
        Szczegółowa klauzula informacyjna PayPro S.A. dotycząca przetwarzania danych osobowych
        Płatników dostępna jest pod adresem:{" "}
        <a
          href="https://www.przelewy24.pl/obowiazek-informacyjny-rodo-platnicy"
          target="_blank"
          rel="noopener noreferrer"
        >
          przelewy24.pl/obowiazek-informacyjny-rodo-platnicy
        </a>
        .
      </p>
    </>
  );
}
