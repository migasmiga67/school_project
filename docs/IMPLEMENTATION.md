# Stan implementacji MVP

Zaimplementowano krótką, grywalną wyprawę opisaną w [projekcie gry](GAME_DESIGN.md). Dokumentacja wersji docelowej nadal obejmuje funkcje wykraczające poza ten prototyp.

## Dostarczone funkcje

- TypeScript strict, Phaser 3.90 i Vite; czysty, deterministyczny rdzeń bez zależności od renderera.
- 8×8, ruch BFS, 2 PA na bohatera, odnowienia `readyRound = r + C`, przełączanie bohaterów.
- Wszystkie sześć zdolności Ignisa, Kaela i Lyry; kolizje, otchłanie, osłony, tarcze i sidła.
- Zablokowane intencje wrogów i prognoza całej fazy przez ten sam reducer co rzeczywiste wykonanie.
- Trzy przygotowane komnaty, dwa archetypy przeciwników i mini-boss; ochrona Obelisku.
- Zwycięstwo, porażka i nowy run; wybór reliktów, leczenie i powrót poległych między komnatami.
- Sześć bazowych reliktów i dwa odblokowania za Echa; idempotentne rozliczanie nagród.
- Lokalny zapis po komendach, walidacja importowanego JSON, eksport/import, komunikaty błędów storage.
- Polski interfejs, sterowanie myszą i klawiaturą, fokus dialogów, opisy zdolności i przewodnik.
- Oryginalne postacie i kafle pixelowe generowane w Phaser, animacje, halo, efekty trafień i ograniczenie ruchu.
- Syntezowany ambient i efekty, start po geście użytkownika, wyciszenie.
- Produkcyjny build z relatywnymi adresami, gotowa kopia strony w katalogu głównym i workflow Pages publikujący `dist`.

## Weryfikacja

- `npm run typecheck`: TypeScript bez błędów.
- `npm test`: **56 testów** — 33 testy mechanik, 19 progresji/zapisu, 4 scenariusze rzeczywistych map i całej kampanii.
- Test kampanii odtwarza legalne zapisane komendy wszystkich trzech komnat, bez zmiany HP, pomijania AI ani nadpisywania wyniku. Każdą mapę można wygrać bez reliktów; pełny run potwierdza rzeczywiste nagrody i przenoszone zdrowie.
- `npm run build`: produkcyjny artefakt i kopia Pages powstają poprawnie.
- `npm run test:e2e`: **7/7 testów Playwright** przeszło na gotowych plikach pod `/school_project/`: renderer i brak 404, ruch i zapis po reloadzie, tarcza, klawiatura, prognoza, porażka/restart i pełna kampania przez UI. Test kampanii wykonuje 46 legalnych komend, bez zmiany HP/terenu/liczby wrogów; wynik to zwycięstwo, Obelisk 6 HP, Kael 6 HP i 5 Ech. Reload nie dubluje nagrody. Raport dotyczy lokalnego serwera produkcyjnego, nie zdalnego GitHub Pages.
- Przy 1440×1100 i 1280×900 potwierdzenie akcji oraz koniec tury mieszczą się w widoku.

Wyjście z testów i ich konfiguracja znajdują się w repozytorium. Testy nie zastępują zewnętrznego playtestu balansu ani pomiarów na wielu urządzeniach.

## Świadome ograniczenia

- To MVP trzech komnat; pełne dziewięć walk, trzy sektory, rozgałęziona trasa i zakończenia fabularne pozostają projektem.
- Tkacz Szczelin oraz warianty umiejętności nie są częścią bieżącej zawartości.
- Dostarczono przewodnik i wskazówki, bez rozbudowanego samouczka blokującego kolejne kroki.
- Zapis korzysta z jednego atomowego envelope localStorage zamiast planowanego IndexedDB. Nie ma kont ani synchronizacji urządzeń; służy do tego ręczny eksport.
- Nagrody używają zapisanego xorshift32 zamiast proponowanego w specyfikacji xoshiro128**. Walka pozostaje całkowicie deterministyczna i nie losuje trafień.
- Światło jest realizowane przez halo i proceduralne efekty; nie ma normal map ani pełnego systemu oświetlenia sceny. Audio jest oryginalnym syntetycznym ambientem, bez nagrań i osobnych suwaków głośności.
- Zalecany jest ekran minimum 960 CSS px. Interfejs telefoniczny w pionie i pełna obsługa czytników ekranu nie są ukończone.
- Testy przeglądarkowe uruchomiono w Chromium. Firefox i pozostałe przeglądarki wymagają osobnej walidacji.

## Stabilność testów CI

Pełna kampania ma limit 300 sekund, ponieważ wykonuje 46 komend przez interfejs i może trwać ponad 2 minuty na współdzielonym runnerze. Pozostałe testy zachowują limit 30 sekund, asercje 10 sekund, a pojedyncze akcje 15 sekund. Wszystkie sprawdzenia zwycięstwa, HP, nagród i zapisu pozostają aktywne. Każda akcja kampanii jest nazwaną fazą raportu.

Domyślny serwer Playwright `scripts/serve-dist.mjs` udostępnia wyłącznie zbudowany `dist` pod `/school_project/`, bez Vite i dostępu do źródeł. CI zachowuje screenshoty, trace i raport HTML jako artefakt `browser-failure-diagnostics`, gdy krok nie przejdzie.

## Publikacja

Źródła znajdują się w `src`, wejście deweloperskie w `app`. `npm run build` odświeża `dist` oraz gotowe `index.html` i `assets` w katalogu głównym repozytorium. Strona nie wymaga serwera aplikacji.

GitHub Pages może użyć `main / (root)` albo workflow `Deploy Grid Legends` z ustawieniem Source = GitHub Actions. W obu wariantach wysyłane są skompilowane moduły; nie należy używać `app/index.html` bez Vite. Przy zmianie kodu wykonaj ponowny build i wyślij również kopię statyczną.
