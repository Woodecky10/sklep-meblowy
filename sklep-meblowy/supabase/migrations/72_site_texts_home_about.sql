-- Edytowalny opis sklepu na stronie głównej (sekcja „Dlaczego warto kupować u nas?").
--
-- Treść trafia do istniejącej tabeli site_texts pod kluczem `home_about` jako
-- HTML z edytora WYSIWYG w /admin/strona-glowna. Renderowanie idzie przez
-- sanitizeRichHtml (ta sama whitelista co opisy produktów), więc panel nie może
-- wstrzyknąć skryptu.
--
-- Seed = dzisiejsza treść ze słownika. Bez niego strona wyglądałaby tak samo
-- (AboutStore ma fallback na słownik), ale panel otwierałby się z PUSTYM polem
-- i każda drobna poprawka wymagałaby przepisania całego tekstu od zera.
--
-- Wersji DE celowo NIE zasiewamy: `siteText()` dla DE bierze value_de → value →
-- fallback, więc pusta kolumna oznacza tekst polski, a nie brak tekstu.
-- Niemiecka wersja i tak jest zamrożona (DE_ENABLED).

insert into public.site_texts (key, value, value_de)
values (
  'home_about',
  concat(
    '<p>Tworzymy meble, które mają być czymś więcej niż tylko wyposażeniem wnętrza. Mollien to sklep internetowy z meblami tapicerowanymi — łóżkami, materacami, narożnikami, sofami i fotelami — w którym stawiamy na połączenie nowoczesnego designu, komfortu i jakości wykonania, aby każdy mebel dobrze wyglądał nie tylko w dniu zakupu, ale przede wszystkim sprawdzał się na co dzień.</p>',
    '<h3>Polska produkcja</h3><p>Nasze meble powstają w Polsce, z dbałością o każdy etap ich wykonania. Produkujemy je sami, dzięki czemu odpowiadamy za jakość konstrukcji, materiałów i wykończenia.</p>',
    '<h3>Nowoczesny design</h3><p>Tworzymy kolekcje inspirowane współczesnymi trendami, ale zależy nam również na tym, aby nasze meble były ponadczasowe. Zaokrąglone bryły, miękkie formy i charakterystyczne detale pozwalają stworzyć wnętrze z własnym charakterem.</p>',
    '<h3>Meble dopasowane do Ciebie</h3><p>Wiele naszych kolekcji ma modułową konstrukcję, dzięki której możesz stworzyć układ odpowiadający Twojej przestrzeni. Sofa, narożnik czy większy zestaw? To Ty decydujesz, jak będzie wyglądał Twój mebel.</p>',
    '<h3>Wybierz swoją tkaninę</h3><p>Wiemy, że każdy ma inny gust. Dlatego oferujemy szeroki wybór tkanin i kolorów, dzięki którym możesz dopasować mebel do swojego wnętrza. Chcesz zobaczyć materiał przed zakupem? Możesz zamówić bezpłatne próbki tkanin.</p>',
    '<h3>Komfort, który ma znaczenie</h3><p>Dobry design to nie wszystko. Mebel powinien być przede wszystkim wygodny. Dlatego zwracamy uwagę na proporcje, głębokość siedzisk, wysokość oraz odpowiednie wyprofilowanie poszczególnych elementów.</p>',
    '<h3>Doradzamy, nie tylko sprzedajemy</h3><p>Wybór sofy czy narożnika to zakup na lata. Jeśli nie wiesz, który model, rozmiar albo tkanina będzie najlepszym wyborem, możesz się z nami skontaktować. Chętnie pomożemy dobrać rozwiązanie odpowiednie do Twojego wnętrza i potrzeb.</p>',
    '<h3>Darmowa dostawa na terenie całej Polski</h3><p>Chcemy, aby zakup mebli był prosty również od strony logistycznej. Zapewniamy darmową dostawę na terenie całej Polski.</p>',
    '<h3>Mollien — Twój mebel, Twój styl</h3><p>Nie chcemy tworzyć mebli, które wyglądają tak samo w każdym domu. Chcemy dać Ci możliwość stworzenia wnętrza po swojemu. Wybierz model, konfigurację, rozmiar i tkaninę, a my zadbamy o jego wykonanie.</p>',
    '<p>Konto w sklepie, zakładane adresem e-mail lub przez Google, służy do śledzenia zamówienia, historii zakupów i zapisywania ulubionych modeli; do przeglądania oferty nie jest potrzebne.</p>',
    '<p><strong>Mollien — polskie meble stworzone z myślą o Twoim wnętrzu.</strong></p>'
  ),
  null
)
on conflict (key) do nothing;
