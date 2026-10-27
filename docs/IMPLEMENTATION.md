# Zakres prototypu Neon Coast

Gra jest oryginalnym, proceduralnie rysowanym sandboxem jazdy 3D. Nie używa gotowych modeli, nagrań ani zasobów z komercyjnych gier. Three.js udostępniany jest na licencji MIT, a grafika, shader oceanu, znaki i dźwięki powstały w kodzie projektu. Fonty są systemowe, bez CDN.

Symulacja w `game.ts` jest oddzielona od renderera. Budynki i granice świata mają współdzielone dane kolizji. Testy sprawdzają ruch, hamowanie, kolizje, zmianę trybu, misje, nagrody, pościgi, areszt oraz odzyskanie auta. Kamera i oprawa nie zmieniają wyników misji.

Pozycja nie jest zapisywana między sesjami. Lokalny profil zachowuje gotówkę, statystyki i wyciszenie. Niedostępny zapis pozostawia działającą sesję gry.

Ograniczenia: niewielkie miasto, uproszczona fizyka i AI, brak wnętrz, rozbudowanej kampanii, broni i multiplayera. Dotyk ma podstawowe przyciski; zalecany jest komputer z klawiaturą oraz akceleracją WebGL. WebGL jest wymagany, a błąd inicjalizacji otrzymuje widoczny komunikat.

## Weryfikacja dostarczonej wersji

- TypeScript i kompilacja produkcyjna przechodzą.
- **35 testów logiki**: 27 testów gry, 3 testy zegara symulacji i 5 testów kamery. Sprawdzają także objazd budynku przez policję, ponawianie misji i cykl zleceń po odtworzeniu statystyk.
- **7 testów Playwright** na gotowych plikach pod `/school_project/`: uruchomienie bez 404 i wyjątków, rzeczywista jazda klawiaturą, wysiadanie/chód/wsiadanie, pauza, kamera i wyciszenie po reloadzie. Aktualny przebieg lokalny trwał około 52 sekund. Dwa nowe scenariusze sprawdzają rzeczywisty obrót myszą, ruch W/D względem widoku, zoom oraz przechwycenie i zwolnienie kursora.
- Testy dostawy i wyścigu ustawiają pojazd na punktach kontrolnych, aby sprawdzić reguły i nagrody; nie są zapisem przejechania całych tras. Testy przeglądarkowe korzystają z rzeczywistej klawiatury, bez teleportowania gracza.
- Grafika była sprawdzana w Chromium przy 1440×900 i 1280×800. Pozostałe przeglądarki i urządzenia wymagają osobnej walidacji.

## Wydajność

Na renderowaniu programowym (SwiftShader) gra automatycznie korzysta z materiałów Lambert, niższej rozdzielczości obrazu 3D, łączonej geometrii i uproszczonych cieni. Interfejs DOM pozostaje ostry. Na sprzętowym WebGL zachowane są materiały Standard i mapa cieni. Wyłączone MSAA ogranicza koszt rasteryzacji; rozdzielczość na sprzętowym GPU uwzględnia HiDPI.

Zegar dzieli czas klatki na kroki do 1/60 sekundy, z ograniczonym nadrabianiem do 0,2 s. Wolniejszy rendering nie skraca kroku gry do stałych 0,05 s; test porównuje jazdę przy 60 i 10 renderowanych klatkach na sekundę. Po ukryciu karty gra przechodzi w pauzę.

Pomiar w lokalnym Chromium/SwiftShader przy 1440×900: przed optymalizacją około 2,70 FPS i 1232 wywołania renderowania na klatkę, po optymalizacji około 14,27 FPS i 140 wywołań. To pomiar renderowania programowego w środowisku testowym, nie deklaracja wydajności na wszystkich komputerach. Sprzętowe WebGL jest zalecane.

## Sterowanie myszą i kamera

Kierunek kamery jest oddzielony od kierunku postaci. Ruch pieszy jest liczony względem poziomego kierunku widoku, z normalizacją przekątnych i zachowaniem kolizji. Kamera nie obraca się automatycznie za postacią podczas strafowania. W aucie pozostaje klasyczny gaz/hamulec i skręt; po kilku sekundach bez ruchu myszy widok płynnie wraca za jadący pojazd.

Kliknięcie obrazu włącza Pointer Lock, prawy przycisk i przeciąganie pozwalają rozglądać się bez niego, a kółko zmienia dystans (w pierwszej osobie pole widzenia). Pitch i zoom mają ograniczenia. Pauza zwalnia kursor i czyści wejście; opuszczenie Pointer Lock także otwiera pauzę. Odmowa Pointer Lock pozostawia działające przeciąganie. Tryb pierwszej osoby jest dostępny także pieszo.
