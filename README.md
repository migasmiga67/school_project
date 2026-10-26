# Grid Legends: Echoes of the Void

Grywalna przeglądarkowa gra **2D Turn-Based Tactics / Dungeon Crawler** w TypeScript i Phaser 3. Trzech Strażników, plansza 8×8 i deterministyczna walka z podglądem zamiarów przeciwników.

## Gra

[Otwórz Grid Legends](https://migasmiga67.github.io/school_project/)

Pierwsze MVP obejmuje trzy komnaty, sześć zdolności, mini-bossa, relikty, Echa i dwa trwałe odblokowania. Każda wyprawa może zakończyć się zwycięstwem lub resetem linii czasowej. Stan zapisuje się lokalnie po zatwierdzonych akcjach; w ustawieniach można eksportować i importować JSON. Bez backendu, kont i zewnętrznych assetów.

## Uruchomienie

Node.js 22 LTS:

```sh
npm ci
npm run dev
```

W środowisku z ograniczonym zapisem domowego cache użyj `npm ci --cache /workspace/.npm-cache`. Serwer Vite używa domyślnie portu 5173. Źródłowy HTML znajduje się w `app/index.html`; `app/entry.ts` ładuje aplikację z katalogu `src`.

```sh
npm run typecheck
npm test
npm run build
npm run test:e2e
```

Testy E2E używają lokalnego Chromium, jeśli jest dostępny. W innym środowisku wykonaj `npx playwright install chromium`. Zmienna `CHROMIUM_PATH` wybiera przeglądarkę; `GRID_BASE_URL` pozwala testować własny serwer, również pod podścieżką. Playwright domyślnie uruchamia Vite na porcie 5174.

## Sterowanie

- Kliknij Strażnika lub naciśnij **1 / 2 / 3**.
- Wybierz ruch (**M**) lub umiejętność (**Q / W**), kliknij cel i **potwierdź akcję**.
- **Esc** anuluje wybór bez kosztu. Przycisk „Zakończ turę” uruchamia zapowiedziane intencje wrogów.
- Na sfokusowanej planszy **strzałki** wybierają pole, a **Enter** wybiera cel lub potwierdza przygotowaną akcję.

Chroń Obelisk. Pchnięcie w Otchłań zabija. Strzały blokują jednostki i przeszkody. Piorun kosztuje 2 PA i może ranić drużynę. Sidła zatrzymują ruch, nie atak. Każdy wróg wykonuje ruch **albo** atak w widocznej kolejności.

## Publikacja

`npm run build` buduje `dist` oraz odświeża gotowe `index.html`, `assets/`, favicon i `.nojekyll` w katalogu głównym. Dzięki temu GitHub Pages działa zarówno przy **Deploy from a branch → main → / (root)**, jak i przy **GitHub Actions** publikującym `dist`. Po zmianach źródeł zawsze zbuduj i wyślij także gotową kopię.

Workflow `Deploy Grid Legends` sprawdza typy, testy, build i testy przeglądarkowe przed publikacją. Dla tego wariantu wybierz **Settings → Pages → Source → GitHub Actions**. Kod źródłowy nie jest bezpośrednią stroną produkcyjną. W wynikowym HTML nie może być importu `/src/main.ts` ani `/src/main.js`.

## Dokumentacja i zakres

- [Projekt gry](docs/GAME_DESIGN.md)
- [Architektura](docs/TECHNICAL_DESIGN.md)
- [Plan i kryteria akceptacji](docs/DELIVERY_PLAN.md)
- [Stan implementacji i weryfikacji](docs/IMPLEMENTATION.md)

To krótka wyprawa MVP, nie pełna dziewięciokomnatowa kampania ze specyfikacji. Oprawa jest oryginalną grafiką pixelową generowaną w Phaser i syntezowanym audio. Zalecany ekran ma co najmniej 960 CSS px szerokości; pełny pionowy interfejs telefoniczny i czytniki ekranu nie należą jeszcze do ukończonego zakresu.
