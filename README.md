# Neon Coast — Street Stories

Oryginalny, niewielki sandbox 3D w przeglądarce, inspirowany miejskimi grami akcji: odkrywanie wybrzeża, jazda samochodem, ruch pieszy, misje i pościgi. TypeScript, Three.js i Vite; grafika proceduralna bez zewnętrznych assetów.

[Otwórz grę](https://migasmiga67.github.io/school_project/)

## Zawartość

- Pastelowe miasto o zachodzie słońca: 15 bloków zabudowy, park, plaża, molo, palmy, światła i ocean.
- Auto sportowe i sedany, zaparkowane pojazdy i ruch uliczny; można wysiadać, chodzić, sprintować i przejmować auta.
- Gaz, hamulec, jazda wstecz, ręczny, nitro i kolizje z zabudową oraz pojazdami.
- Trzy typy zleceń: dostawa, wyścig przez punkty kontrolne, ucieczka przed policją.
- Trzy poziomy pościgu, radiowozy, areszt i powrót na drogę.
- Pokoje online do 4 osób: widoczni gracze i ich samochody oraz wspólny stół pokerowy.
- Kasyno Sapphire Club z wejściem pieszo, wnętrzem 3D i stołem Texas Hold’em przeciwko trzem komputerowym graczom; rozdanie rozgrywa się przy stole w widocznej sali kasyna.
- Poker: flop, turn, river, podbijanie, all-in, pule boczne i rozliczanie wygranych z wirtualną gotówką postaci.
- Minimapka, znacznik celu, gotówka, stan auta, trzy kamery, pauza, syntetyczny dźwięk.
- Gotówka, liczba ukończonych misji, rekord i ustawienie dźwięku zapisują się lokalnie. Po odświeżeniu rozpoczyna się nowa sesja miasta; pozycja i etap bieżącej misji nie są zapisywane.

To mały samodzielny prototyp, a nie projekt o skali pełnej produkcji AAA. Nie zawiera kampanii fabularnej ani broni.

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

Przy stole kamera pokazuje wnętrze kasyna, przeciwników, karty i żetony w 3D. Przeciągaj wolny obszar widoku prawym przyciskiem myszy, aby rozglądać się po sali. Karty i przyciski licytacji pozostają w niewielkich panelach; po odejściu od stołu wracasz do swobodnego chodzenia po kasynie.

Wyjście w trakcie rozdania wymaga potwierdzenia i oznacza pas. Niewykorzystane żetony wracają do portfela, a postawione zostają w puli. Odświeżenie strony działa tak samo: zwraca zapisany, niewykorzystany stos tylko raz; bieżące rozdanie nie jest wznawiane.

## Gra online

Wybierz **Graj online** na ekranie startowym lub przycisk online w grze. Wpisz pseudonim i utwórz pokój albo dołącz kodem od znajomego. Gospodarz może skopiować link z zaproszeniem. Po połączeniu wybierz wejście do miasta. W pokoju mieszczą się maksymalnie **4 osoby**.

Pokoje służą wspólnej eksploracji miasta i grze w kasynie. Widać poruszające się postacie oraz prowadzone przez innych samochody. Lokalna pauza zatrzymuje twoją postać; pozostali mogą dalej grać. Zlecenia należą do trybu solo i wracają po opuszczeniu pokoju.

W kasynie podejdź do stołu i użyj **E**. Każdy gracz osobno zajmuje miejsce za **$200**. Gdy usiądą co najmniej dwie osoby, można rozdać karty. Przy stole online decyzje podejmują ludzie; gospodarz sprawdza kolejność akcji, rozlicza pule i przekazuje każdemu tylko jego prywatne karty. Na ruch jest **30 sekund**; po upływie czasu gracz czeka, jeśli może, albo pasuje.

Online dostajesz osobny, sesyjny portfel **$1250**. Wpisowe i wygrane nie zmieniają lokalnego zapisu trybu solo. Odejście od stołu zwraca niewykorzystane żetony do portfela pokoju. Salda online i pokój nie są zapisywane po zakończeniu sesji.

Połączenia korzystają z WebRTC i sygnalizatora PeerJS. Gospodarz utrzymuje pokój w swojej przeglądarce — musi pozostawić stronę otwartą. Jego rozłączenie kończy sesję pozostałych osób. Publiczny sygnalizator i serwery ICE muszą być dostępne z sieci graczy. Dostępne są połączenia bezpośrednie oraz pośrednictwo TURN przez UDP lub TCP; całkowita blokada serwerów ICE w sieci może uniemożliwić dołączenie. Po błędzie można ponowić dołączanie lub utworzyć nowy pokój.

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

W środowisku chmurowym można użyć `npm ci --cache /workspace/.npm-cache`. `src/game.ts` zawiera logikę i fizykę, `src/world.ts` scenę Three.js, a `src/main.ts` interfejs i wejście. `src/casino-view.ts` buduje kasyno; `src/poker.ts` odpowiada za zasady i boty, a `src/poker-ui.ts` za interfejs stołu. `src/room-authority.ts` prowadzi pokój i wspólny stół, a `src/multiplayer-client.ts` obsługuje połączenia WebRTC.

Testy Playwright wymagają Chromium. Obsługiwany jest `CHROMIUM_PATH`, lokalne `/usr/bin/chromium` lub oficjalny browser z `npx playwright install chromium`. Domyślnie testowany jest **gotowy `dist` pod `/school_project/` na porcie 5185**. `NEON_BASE_URL` pozwala wskazać inny serwer. Grafika i audio powstają programowo; tryb solo nie wymaga zewnętrznych zasobów.

Testy multiplayer uruchamiają lokalny PeerServer na porcie **9000**, serwer TURN/TCP na **3478** (kontrola gotowości: **9002**) i dwie niezależne przeglądarki. Połączenia przechodzą przez prawdziwy serwer TURN, co sprawdza również sieci blokujące bezpośredni ruch UDP. Sprawdzają prawdziwe połączenia WebRTC, ruch graczy, rozdanie, prywatność kart, wypłaty i rozłączenie gospodarza. Nie zastępują weryfikacji publicznego sygnalizatora ani połączeń pomiędzy różnymi sieciami. Ustawienie serwera testowego jest wstrzykiwane wyłącznie na adresie loopback; gotowa strona korzysta z publicznej konfiguracji PeerJS.

### Własny sygnalizator

Lokalny serwer można uruchomić poleceniem `node scripts/serve-peers.mjs`. Do pracy z nim uruchom klienta z ustawieniami:

```sh
VITE_PEER_HOST=127.0.0.1 VITE_PEER_PORT=9000 VITE_PEER_PATH=/peerjs VITE_PEER_SECURE=false npm run dev
```

Własny serwer produkcyjny konfiguruje się przez te same zmienne `VITE_PEER_HOST`, `VITE_PEER_PORT`, `VITE_PEER_PATH` i `VITE_PEER_SECURE` przed budowaniem. Strona HTTPS, w tym GitHub Pages, wymaga sygnalizatora HTTPS/WSS. Nie publikuj kompilacji ze wskazaniem lokalnego serwera testowego.

## Publikacja

`npm run build` odświeża `dist` i gotową kopię w katalogu głównym: `index.html`, `assets`, favicon oraz `.nojekyll`. Pages może korzystać z `main / (root)` lub z workflow **Deploy Neon Coast** publikującego `dist`.

Workflow sprawdza typy, testy logiki, budowanie i testy przeglądarkowe. Raporty awarii zachowuje w artefakcie. W wariancie Actions ustaw **Settings → Pages → Source → GitHub Actions**. Nie publikuj źródłowego `app/index.html` bez kompilacji.
