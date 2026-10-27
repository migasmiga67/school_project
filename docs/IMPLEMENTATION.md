# Zakres prototypu Neon Coast

Gra jest oryginalnym, proceduralnie rysowanym sandboxem jazdy 3D. Nie używa gotowych modeli, nagrań ani zasobów z komercyjnych gier. Three.js udostępniany jest na licencji MIT, a grafika, shader oceanu, znaki i dźwięki powstały w kodzie projektu. Fonty są systemowe, bez CDN.

Symulacja w `game.ts` jest oddzielona od renderera. Budynki i granice świata mają współdzielone dane kolizji. Testy sprawdzają ruch, hamowanie, kolizje, zmianę trybu, misje, nagrody, pościgi, areszt oraz odzyskanie auta. Kamera i oprawa nie zmieniają wyników misji.

Pozycja nie jest zapisywana między sesjami. Lokalny profil zachowuje gotówkę, statystyki i wyciszenie. Niedostępny zapis pozostawia działającą sesję gry.

Ograniczenia: niewielkie miasto, uproszczona fizyka i AI, brak wnętrz, rozbudowanej kampanii, broni i multiplayera. Dotyk ma podstawowe przyciski; zalecany jest komputer z klawiaturą oraz akceleracją WebGL. WebGL jest wymagany, a błąd inicjalizacji otrzymuje widoczny komunikat.

## Weryfikacja dostarczonej wersji

- TypeScript i kompilacja produkcyjna przechodzą.
- **24 testy logiki**: 21 testów gry i 3 testy zegara symulacji. Sprawdzają także objazd budynku przez policję, ponawianie misji i cykl zleceń po odtworzeniu statystyk.
- **5 testów Playwright** na gotowych plikach pod `/school_project/`: uruchomienie bez 404 i wyjątków, rzeczywista jazda klawiaturą, wysiadanie/chód/wsiadanie, pauza, kamera i wyciszenie po reloadzie. Końcowy przebieg lokalny trwał około 31 sekund.
- Testy dostawy i wyścigu ustawiają pojazd na punktach kontrolnych, aby sprawdzić reguły i nagrody; nie są zapisem przejechania całych tras. Testy przeglądarkowe korzystają z rzeczywistej klawiatury, bez teleportowania gracza.
- Grafika była sprawdzana w Chromium przy 1440×900 i 1280×800. Pozostałe przeglądarki i urządzenia wymagają osobnej walidacji.

## Wydajność

Na renderowaniu programowym (SwiftShader) gra automatycznie korzysta z materiałów Lambert, niższej rozdzielczości obrazu 3D, łączonej geometrii i uproszczonych cieni. Interfejs DOM pozostaje ostry. Na sprzętowym WebGL zachowane są materiały Standard i mapa cieni. Wyłączone MSAA ogranicza koszt rasteryzacji; rozdzielczość na sprzętowym GPU uwzględnia HiDPI.

Zegar dzieli czas klatki na kroki do 1/60 sekundy, z ograniczonym nadrabianiem do 0,2 s. Wolniejszy rendering nie skraca kroku gry do stałych 0,05 s; test porównuje jazdę przy 60 i 10 renderowanych klatkach na sekundę. Po ukryciu karty gra przechodzi w pauzę.

Pomiar w lokalnym Chromium/SwiftShader przy 1440×900: przed optymalizacją około 2,70 FPS i 1232 wywołania renderowania na klatkę, po optymalizacji około 14,27 FPS i 140 wywołań. To pomiar renderowania programowego w środowisku testowym, nie deklaracja wydajności na wszystkich komputerach. Sprzętowe WebGL jest zalecane.
