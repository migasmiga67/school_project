# Neon Coast — Street Stories

Oryginalny, niewielki sandbox 3D w przeglądarce, inspirowany miejskimi grami akcji: odkrywanie wybrzeża, jazda samochodem, ruch pieszy, misje i pościgi. TypeScript, Three.js i Vite; grafika proceduralna bez zewnętrznych assetów.

[Otwórz grę](https://migasmiga67.github.io/school_project/)

## Zawartość

- Pastelowe miasto o zachodzie słońca: 15 bloków zabudowy, park, plaża, molo, palmy, światła i ocean.
- Auto sportowe i sedany, zaparkowane pojazdy i ruch uliczny; można wysiadać, chodzić, sprintować i przejmować auta.
- Gaz, hamulec, jazda wstecz, ręczny, nitro i kolizje z zabudową oraz pojazdami.
- Trzy typy zleceń: dostawa, wyścig przez punkty kontrolne, ucieczka przed policją.
- Trzy poziomy pościgu, radiowozy, areszt i powrót na drogę.
- Minimapka, znacznik celu, gotówka, stan auta, trzy kamery, pauza, syntetyczny dźwięk.
- Gotówka, liczba ukończonych misji, rekord i ustawienie dźwięku zapisują się lokalnie. Po odświeżeniu rozpoczyna się nowa sesja miasta; pozycja i etap bieżącej misji nie są zapisywane.

To mały samodzielny prototyp, a nie projekt o skali pełnej produkcji AAA. Nie zawiera kampanii fabularnej, broni, multiplayera ani wnętrz budynków.

## Sterowanie

| Klawisz | Akcja |
| --- | --- |
| WASD / strzałki | jazda lub poruszanie się pieszo |
| Spacja | hamulec ręczny |
| Shift | nitro / sprint |
| E | wsiadanie i wysiadanie po zwolnieniu |
| C | zmiana kamery |
| M | kolejne zlecenie po zakończeniu aktualnego |
| R | powrót na drogę i naprawa za opłatą |
| P / Esc | pauza |
| H / ? | pomoc |

Złoty znacznik wskazuje cel. Przejmowanie obcych aut i kolizje przyciągają policję. Aby zgubić pościg, oddal się od radiowozów. Misja ucieczki wymaga także dotarcia do kryjówki.

## Rozwój i testy

Node.js 22 LTS:

```sh
npm ci
npm run dev
npm run typecheck
npm test
npm run build
npm run test:e2e
```

W środowisku chmurowym można użyć `npm ci --cache /workspace/.npm-cache`. `src/game.ts` zawiera logikę i fizykę, `src/world.ts` scenę Three.js, a `src/main.ts` interfejs i wejście.

Testy Playwright wymagają Chromium. Obsługiwany jest `CHROMIUM_PATH`, lokalne `/usr/bin/chromium` lub oficjalny browser z `npx playwright install chromium`. Domyślnie testowany jest **gotowy `dist` pod `/school_project/` na porcie 5185**. `NEON_BASE_URL` pozwala wskazać inny serwer. Wszystkie zewnętrzne zasoby gry są lokalne; grafika i audio powstają programowo.

## Publikacja

`npm run build` odświeża `dist` i gotową kopię w katalogu głównym: `index.html`, `assets`, favicon oraz `.nojekyll`. Pages może korzystać z `main / (root)` lub z workflow **Deploy Neon Coast** publikującego `dist`.

Workflow sprawdza typy, testy logiki, budowanie i testy przeglądarkowe. Raporty awarii zachowuje w artefakcie. W wariancie Actions ustaw **Settings → Pages → Source → GitHub Actions**. Nie publikuj źródłowego `app/index.html` bez kompilacji.
