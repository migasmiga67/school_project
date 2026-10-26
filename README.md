# Szmaragdowa wyspa

Prosta przeglądarkowa gra RPG 3D w Three.js. Zbierz pięć kryształów, pokonaj cztery szlamy i aktywuj sanktuarium na północy wyspy.

## Uruchomienie

Wymagany Node.js 20.19+ lub 22.12+.

```sh
npm ci --cache /workspace/.npm-cache
npm run dev
```

Serwer deweloperski korzysta z portu 5173. Kompilacja produkcyjna: `npm run build`. Podgląd kompilacji: `npm run preview`.

## Sterowanie

- WASD lub strzałki — ruch względem kamery.
- Shift — sprint.
- Spacja — atak pobliskich przeciwników.
- R — mikstura lecznicza (trzy na start).
- E — aktywacja sanktuarium po wykonaniu zadania.
- Na ekranach dotykowych dostępne są przyciski ruchu i akcji.

Ognisko leczy bohatera. Pokonanie przeciwników daje doświadczenie; awans zwiększa obrażenia i maksymalne zdrowie. Kryształy podnosisz automatycznie, podchodząc do nich. Po zwycięstwie lub porażce możesz rozpocząć od nowa. Gra nie zapisuje postępu.

## Publikacja w GitHub Pages

W repozytorium otwórz **Settings → Pages → Build and deployment → Source** i wybierz **GitHub Actions**. Workflow `Deploy game to GitHub Pages` buduje grę i publikuje katalog `dist` po wysłaniu zmian do `main`. Jeśli ustawienie zmieniono już po pushu, uruchom workflow ręcznie w zakładce **Actions**.

Nie publikuj samego katalogu `app`: przeglądarka potrzebuje skompilowanych plików. Przy innym hostingu uruchom `npm ci` i `npm run build`, a jako katalog publikacji ustaw `dist`.

## Pliki źródłowe i gotowa strona

Kod gry znajduje się w `app/src/`, a źródłowy HTML w `app/index.html`. `npm run dev` uruchamia ten kod przez Vite.

`npm run build` tworzy `dist` oraz odświeża gotową stronę w katalogu głównym (`index.html`, `assets/`, `favicon.svg`, `.nojekyll`). Te gotowe pliki są zapisane w Git, aby Pages działało również z ustawieniem **Deploy from a branch → main → / (root)**. Po zmianie kodu wykonaj build i wyślij również zaktualizowane pliki wynikowe. Nadal można korzystać z workflow GitHub Actions, który publikuje `dist`.
