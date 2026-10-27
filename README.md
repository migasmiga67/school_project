# Neon Coast — Street Stories

Oryginalny, niewielki sandbox 3D w przeglądarce, inspirowany miejskimi grami akcji: odkrywanie wybrzeża, jazda samochodem, ruch pieszy, misje i pościgi. TypeScript, Three.js i Vite; grafika proceduralna bez zewnętrznych assetów.

[Otwórz grę](https://migasmiga67.github.io/school_project/)

## Zawartość

- Pastelowe miasto o zachodzie słońca: 15 bloków zabudowy, park, plaża, molo, palmy, światła i ocean.
- Auto sportowe i sedany, zaparkowane pojazdy i ruch uliczny; można wysiadać, chodzić, sprintować i przejmować auta.
- Gaz, hamulec, jazda wstecz, ręczny, nitro i kolizje z zabudową oraz pojazdami.
- Trzy typy zleceń: dostawa, wyścig przez punkty kontrolne, ucieczka przed policją.
- Trzy poziomy pościgu, radiowozy, areszt i powrót na drogę.
- Kasyno Sapphire Club z wejściem pieszo, wnętrzem 3D i stołem Texas Hold’em przeciwko trzem komputerowym graczom.
- Poker: flop, turn, river, podbijanie, all-in, pule boczne i rozliczanie wygranych z wirtualną gotówką postaci.
- Minimapka, znacznik celu, gotówka, stan auta, trzy kamery, pauza, syntetyczny dźwięk.
- Gotówka, liczba ukończonych misji, rekord i ustawienie dźwięku zapisują się lokalnie. Po odświeżeniu rozpoczyna się nowa sesja miasta; pozycja i etap bieżącej misji nie są zapisywane.

To mały samodzielny prototyp, a nie projekt o skali pełnej produkcji AAA. Nie zawiera kampanii fabularnej, broni ani multiplayera.

## Sterowanie

| Klawisz | Akcja |
| --- | --- |
| WASD / strzałki | pieszo: ruch względem kamery; w aucie: gaz, hamulec i skręt |
| Mysz po kliknięciu obrazu gry | swobodne rozglądanie |
| Prawy przycisk + przeciąganie | obrót kamery bez blokowania kursora |
| Kółko myszy | przybliżanie i oddalanie |
| Spacja | hamulec ręczny |
| Shift | nitro / sprint |
| E | wsiadanie i wysiadanie po zwolnieniu; wejście do kasyna, stół i wyjście |
| C | zmiana widoku: pościgowy, z góry, pierwsza osoba |
| M | kolejne zlecenie po zakończeniu aktualnego |
| R | powrót na drogę i naprawa za opłatą |
| P / Esc | pauza i zwolnienie kursora |
| H / ? | pomoc |

Kliknij obraz miasta, aby przechwycić mysz. Esc zwalnia kursor i otwiera pauzę; po wznowieniu możesz ponownie kliknąć obraz. Możesz też trzymać prawy przycisk i przeciągać, zachowując dostęp do kursora. Pieszo W zawsze prowadzi w kierunku widoku, a A/D przesuwa w bok. W aucie obrót kamery służy rozglądaniu; skręt pozostaje na A/D.

Złoty znacznik wskazuje cel. Przejmowanie obcych aut i kolizje przyciągają policję. Aby zgubić pościg, oddal się od radiowozów. Misja ucieczki wymaga także dotarcia do kryjówki.

## Kasyno i poker

Kliknij **♠** w górnym pasku, aby wyznaczyć trasę do Sapphire Club. Kasyno jest też oznaczone na minimapie. Wysiądź z auta, podejdź do drzwi i naciśnij **E**. Wejście wymaga zgubienia pościgu. W środku podejdź do stołu i ponownie naciśnij **E**; przy drzwiach ten sam klawisz wraca do miasta. Ruch uliczny i czas zlecenia zatrzymują się podczas pobytu w kasynie.

Wpisowe wynosi **$200**, a ciemne **$5 / $10**. Grasz własnymi kartami przeciwko trzem NPC, wybierając pas, czekanie, sprawdzenie, podbicie lub all-in. Po rozdaniu możesz rozdać kolejne karty albo odejść z pozostałymi żetonami. Cała gotówka jest wirtualna i pochodzi z portfela postaci.

Wyjście w trakcie rozdania wymaga potwierdzenia i oznacza pas. Niewykorzystane żetony wracają do portfela, a postawione zostają w puli. Odświeżenie strony działa tak samo: zwraca zapisany, niewykorzystany stos tylko raz; bieżące rozdanie nie jest wznawiane.

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

W środowisku chmurowym można użyć `npm ci --cache /workspace/.npm-cache`. `src/game.ts` zawiera logikę i fizykę, `src/world.ts` scenę Three.js, a `src/main.ts` interfejs i wejście. `src/casino-view.ts` buduje kasyno; `src/poker.ts` odpowiada za zasady i boty, a `src/poker-ui.ts` za interfejs stołu.

Testy Playwright wymagają Chromium. Obsługiwany jest `CHROMIUM_PATH`, lokalne `/usr/bin/chromium` lub oficjalny browser z `npx playwright install chromium`. Domyślnie testowany jest **gotowy `dist` pod `/school_project/` na porcie 5185**. `NEON_BASE_URL` pozwala wskazać inny serwer. Wszystkie zewnętrzne zasoby gry są lokalne; grafika i audio powstają programowo.

## Publikacja

`npm run build` odświeża `dist` i gotową kopię w katalogu głównym: `index.html`, `assets`, favicon oraz `.nojekyll`. Pages może korzystać z `main / (root)` lub z workflow **Deploy Neon Coast** publikującego `dist`.

Workflow sprawdza typy, testy logiki, budowanie i testy przeglądarkowe. Raporty awarii zachowuje w artefakcie. W wariancie Actions ustaw **Settings → Pages → Source → GitHub Actions**. Nie publikuj źródłowego `app/index.html` bez kompilacji.
