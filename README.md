# Neon Coast — Street Stories

Oryginalny, niewielki sandbox 3D w przeglądarce, inspirowany miejskimi grami akcji: odkrywanie wybrzeża, jazda samochodem, ruch pieszy, misje i pościgi. TypeScript, Three.js i Vite; grafika proceduralna bez zewnętrznych assetów.

[Otwórz grę](https://migasmiga67.github.io/school_project/)

## Zawartość

- Miasto z cyklem dnia i nocy, deszczem, neonami i przechodniami: 15 bloków zabudowy, park, plaża, molo, palmy i ocean.
- Auto sportowe i sedany, zaparkowane pojazdy i ruch uliczny; można wysiadać, chodzić, sprintować i przejmować auta.
- Gaz, hamulec, jazda wstecz, ręczny, nitro i kolizje z zabudową oraz pojazdami.
- Trzy typy zleceń: dostawa, wyścig przez punkty kontrolne, ucieczka przed policją.
- Trzy poziomy pościgu, radiowozy, areszt i powrót na drogę.
- Garaż MOD SHOP: trzy modele własnego auta, lakierowanie oraz ulepszenia silnika, hamulców i nitro.
- Pokoje online do 4 osób: wspólne przejazdy, stół pokerowy, „Nocny przerzut”, napad kooperacyjny i wyścigi między graczami.
- Krótkie wydarzenia miejskie z nagrodami za dotarcie do celu.
- Rozbudowany napad na Northside Bank dla 2–4 osób: zwiad, alarm, wiercenie skarbca pod osłoną i wspólna ucieczka.
- Reputacja, trzy kontakty ze zleceniami, odblokowywany trzeci poziom tuningu, dwa mieszkania i wspólna baza ekipy z wnętrzami 3D.
- Blackjack, ruletka europejska oraz turnieje Texas Hold’em ze znajomymi, z oddzielną pulą i rosnącymi ciemnymi.
- Ruchomy konwój, odzyskiwanie wskazanego auta i rywalizacja kurierów o jedną nagrodę.
- Kasyno Sapphire Club z wejściem pieszo, wnętrzem 3D i stołem Texas Hold’em przeciwko trzem komputerowym graczom; rozdanie rozgrywa się przy stole w widocznej sali kasyna.
- Poker: flop, turn, river, podbijanie, all-in, pule boczne i rozliczanie wygranych z wirtualną gotówką postaci.
- Minimapka z GPS prowadzącym ulicami, numerowanymi znacznikami ekipy i legendą; znacznik celu w świecie, gotówka, stan auta, trzy kamery, pauza, syntetyczny dźwięk.
- Gotówka solo, zakupione auta, tuning, reputacja, mieszkania, wyposażenie, parking, liczba ukończonych misji, rekord i ustawienie dźwięku zapisują się lokalnie. Po odświeżeniu rozpoczyna się nowa sesja miasta; pozycja i etap bieżącej misji nie są zapisywane.

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
| E | wsiadanie i wysiadanie po zwolnieniu; kasyno, stół pokerowy i warsztat |
| C | zmiana widoku: pościgowy, z góry, pierwsza osoba |
| M | solo: kolejne zlecenie po zakończeniu aktualnego; online: gospodarz rozpoczyna „Nocny przerzut” |
| G | trasa do garażu; przy warsztacie otwarcie panelu tuningu |
| J | panel zajęć: garaż, przerzut, napad i wyścig |
| L | kontakty, reputacja, mieszkania, wyposażenie i parking |
| B | wydarzenia uliczne, dołączanie i GPS |
| K | gra przy pobliskim stanowisku w kasynie |
| F | online: wsiadanie jako pasażer lub wysiadanie po zatrzymaniu |
| R | powrót na drogę i naprawa za opłatą |
| P / Esc | pauza i zwolnienie kursora |
| H / ? | pomoc |

Kliknij obraz miasta, aby przechwycić mysz. Esc zwalnia kursor i otwiera pauzę; po wznowieniu możesz ponownie kliknąć obraz. Możesz też trzymać prawy przycisk i przeciągać, zachowując dostęp do kursora. Pieszo W zawsze prowadzi w kierunku widoku, a A/D przesuwa w bok. W aucie obrót kamery służy rozglądaniu; skręt pozostaje na A/D.

Złoty znacznik wskazuje cel. Przejmowanie obcych aut i kolizje przyciągają policję. Aby zgubić pościg, oddal się od radiowozów. Misja ucieczki wymaga także dotarcia do kryjówki.

## Garaż i tuning

**G** wyznacza trasę do MOD SHOP naprzeciwko kasyna; wejście jest przy **(-20, 74)**. Podejdź pieszo albo zatrzymaj własne auto przy bramie i użyj **E** lub ponownie **G**. Warsztat obsługuje własny samochód; podczas wspólnego zlecenia online trzeba najpierw dokończyć aktywność.

Dostępne są **Stratus XS** (auto początkowe), **Sentinel GT za $900** i **Comet RS za $2000**. Comet zawiera pierwszy poziom silnika i nitro. Kupienie auta wybiera je do jazdy; posiadane modele można później przełączać bez kolejnego zakupu. Lakier kosztuje **$80**. Po dwóch podstawowych poziomach silnika, hamulców i nitro, przy **200 REP** odblokowuje się trzeci: odpowiednio **$1000 / $750 / $900**. Tuning zmienia osiągi samochodu.

Garaż solo zapisuje się razem z lokalnym profilem. W pokoju online masz osobny garaż i portfel sesji; zakupy, tuning oraz nagrody online nie zmieniają garażu ani gotówki solo. Po opuszczeniu pokoju wraca własny profil. Garaż online nie jest przenoszony do kolejnego pokoju.

## Żyjące miasto

Pełna doba trwa **12 minut gry**. Zmieniają się oświetlenie, neony i pogoda; po chodnikach spacerują przechodnie. W pokoju online gracze korzystają ze wspólnego czasu miasta.

Co **120 sekund** pojawia się wydarzenie dostępne przez **40 sekund**: zgubiona przesyłka, pomoc na poboczu albo pilna dostawa. Panel wydarzenia i minimapa pokazują cel. Dotrzyj do niego pieszo lub jako kierowca; nagroda **$150–$200** jest odbierana automatycznie w pobliżu, raz za dane wydarzenie w bieżącej sesji. Pasażer nie odbiera nagrody za samo przejechanie przez punkt. Online wypłatę rozlicza gospodarz do portfela pokoju.

## Kasyno i poker

W sali są osobne stanowiska: **blackjack po lewej**, **ruletka po prawej**, **turniej przy lewej ścianie w głębi** i dotychczasowy stół pokerowy pośrodku. Podejdź i naciśnij **E** albo **K** przy dodatkowym stanowisku. Niewielki panel pozostawia widoczne wnętrze 3D.

Blackjack i ruletka przyjmują **$10–$500**, co $10, z wirtualnego portfela. Blackjack obsługuje dobieranie, pozostanie i podwojenie; as może liczyć 1 lub 11, krupier stoi na 17, naturalny blackjack płaci 3:2. Zamknięcie panelu pozwala później dokończyć rozdanie; wyjście z kasyna albo odświeżenie strony oznacza utratę postawionego zakładu. Ruletka ma europejskie zero i zakłady czerwone/czarne, parzyste/nieparzyste albo konkretną liczbę. Wypłaty zawierają zwrot stawki: 2× dla prostych zakładów, 36× dla liczby; zero przegrywa zakłady proste.

Turniej wymaga **2–4 graczy online** przy stanowisku. Gospodarz otwiera zapisy; każdy osobno płaci **$250** i otrzymuje **1000 żetonów turniejowych**. Gospodarz rozpoczyna grę, ciemne rosną co trzy rozdania, a zwycięzca otrzymuje wspólną pulę. Po 24 rozdaniach wygrywa lider liczby żetonów, przy remisie pula jest dzielona. Nie ma ponownych wpisowych w trwającym turnieju. Wycofanie przed startem zwraca wpisowe; po starcie oznacza rezygnację z rywalizacji. Zamknięcie panelu podczas gry pozostawia postać przy stole; **K** przywraca panel. Na decyzję jest 30 sekund. Turniej ma osobny stan i żetony od zwykłego stołu.

Kliknij **♠** w górnym pasku, aby wyznaczyć trasę do Sapphire Club. Kasyno jest też oznaczone na minimapie. Wysiądź z auta, podejdź do drzwi i naciśnij **E**. Wejście wymaga zgubienia pościgu. W środku podejdź do stołu i ponownie naciśnij **E**; przy drzwiach ten sam klawisz wraca do miasta. W trybie solo ruch uliczny i czas zlecenia zatrzymują się podczas pobytu w kasynie.

Wpisowe wynosi **$200**, a ciemne **$5 / $10**. W trybie solo grasz własnymi kartami przeciwko trzem NPC, wybierając pas, czekanie, sprawdzenie, podbicie lub all-in. Po rozdaniu możesz rozdać kolejne karty albo odejść z pozostałymi żetonami. Cała gotówka jest wirtualna i pochodzi z portfela postaci.

Przy stole kamera pokazuje wnętrze kasyna, przeciwników, karty i żetony w 3D. Przeciągaj wolny obszar widoku prawym przyciskiem myszy, aby rozglądać się po sali. Karty i przyciski licytacji pozostają w niewielkich panelach; po odejściu od stołu wracasz do swobodnego chodzenia po kasynie.

Wyjście w trakcie rozdania wymaga potwierdzenia i oznacza pas. Niewykorzystane żetony wracają do portfela, a postawione zostają w puli. W trybie solo odświeżenie strony działa tak samo: zwraca zapisany, niewykorzystany stos tylko raz; bieżące rozdanie nie jest wznawiane.

## Gra online

Wybierz **Graj online** na ekranie startowym lub przycisk online w grze. Wpisz pseudonim i utwórz pokój albo dołącz kodem od znajomego. Gospodarz może skopiować link z zaproszeniem. Po połączeniu wybierz wejście do miasta. W pokoju mieszczą się maksymalnie **4 osoby**. Podczas łączenia **Anuluj łączenie**, zamknięcie panelu lub **Esc** przerywa próbę; możesz potem ponowić dołączanie. Zamknięcie panelu po udanym połączeniu pozostawia cię w pokoju.

Pokoje służą wspólnej eksploracji miasta, zleceniom ekipy i grze w kasynie. Widać poruszające się postacie oraz prowadzone przez innych samochody. Na minimapie znajdziesz kolorowe, numerowane znaczniki znajomych i legendę z ich nazwami. Osoby przebywające w kasynie są oznaczone przy jego wejściu. GPS prowadzi trasą po ulicach do aktualnego celu. Lokalna pauza zatrzymuje twoją postać; pozostali mogą dalej grać. Osobiste zlecenia trybu solo wracają po opuszczeniu pokoju.

### Zajęcia ekipy

Panel **J** zawiera napad, wyścig, przerzut i trasę do garażu. Wspólną aktywność rozpoczyna gospodarz przy co najmniej dwóch połączonych osobach, poza kasynem. Pokój rozgrywa jedną aktywność ekipy naraz. Zamknięcie panelu, lokalna pauza i pobyt w kasynie nie zatrzymują zegara rozpoczętego zlecenia.

**Nocny przerzut:** gdy w pokoju są co najmniej dwie osoby, gospodarz poza kasynem rozpoczyna zlecenie przyciskiem na karcie misji lub klawiszem **M**. Ekipa ma **150 sekund** na zaliczenie **trzech punktów po kolei**. Przez każdy znacznik może przejść lub przejechać dowolny członek pokoju; wspólny cel i postęp widzą wszyscy. Lokalna pauza ani wejście do kasyna nie zatrzymują odliczania.

Po ukończeniu każdy gracz obecny przy starcie i nadal połączony przy zakończeniu otrzymuje jednorazowo **$300** do portfela online. Osoby dołączające w trakcie mogą pomagać, a nagrodę otrzymają od kolejnego przerzutu. Po ukończeniu lub upływie czasu obowiązuje **20 sekund** przerwy przed ponownym startem.

**Skok na Sapphire:** gospodarz jest kierowcą, drugi gracz hakerem, a pozostali zwiadowcami. Kierowca i haker spotykają się przy zewnętrznym wejściu kasyna i osobno wybierają **Potwierdź przygotowanie** w panelu **J**. Haker wysiada, podchodzi do drzwi i wprowadza trzy symbole pokazane tylko w swoim panelu. Trzy błędy blokują sejf. Cały napad ma limit **4 minut**.

Po otwarciu sejfu uruchamia się alarm i pościg. Kierowca musi prowadzić samochód, a co najmniej dwie osoby z początkowej ekipy muszą dotrzeć do kryjówki przy **(-80, 0)**. Mogą podróżować razem. Sukces daje jednorazowo po **$800** uczestnikom pozostającym w pokoju od rozpoczęcia napadu. Późniejsze dołączenie nie uprawnia do nagrody tego napadu. Po zakończeniu lub porażce obowiązuje **20 sekund** przerwy.

**Nocny sprint:** gospodarz przygotowuje wyścig w panelu **J**. Kierowcy mają minutę na podjechanie własnymi samochodami do startu przy **(0, 80)** i osobne zgłoszenie **Gotowy**. Potrzeba dwóch gotowych kierowców. Gra ustawia auta na polach startowych i odlicza **3 sekundy**. Trasa obejmuje **cztery punkty po kolei**, a na przejazd są **3 minuty**.

Ranking pokazuje postęp, czas oraz nagrodę: **$500 / $300 / $150 / $100** według kolejności ukończenia. Wypłata trafia do portfela online raz po finiszu. Rozłączenie lub upływ czasu oznacza **DNF** — bez nagrody za nieukończony przejazd. Pasażerowie i osoby dołączające do pokoju już po przygotowaniu wyścigu mogą go obserwować; wystartują w kolejnym. Po zakończeniu obowiązuje **20 sekund** przerwy przed następnym wyścigiem.

### Wspólne przejazdy

Podejdź pieszo do zatrzymanego samochodu znajomego i naciśnij **F**. W aucie mogą jechać kierowca i maksymalnie trzej pasażerowie. Pasażer porusza się razem z kierowcą i nie steruje autem. **F** lub **E** pozwala wysiąść po zatrzymaniu; wyjście kierowcy z samochodu lub jego rozłączenie automatycznie zwalnia miejsca pasażerów.

### Northside Bank

Panel **J** pozwala wybrać dotychczasowy Sapphire albo większy napad na bank za **$1400 na uczestnika**. Na całość jest **6 minut**. Najpierw zwiadowca sprawdza bank, potem haker pieszo wprowadza prywatne symbole przy alarmie. Przy skarbcu włamywacz uruchamia **8 sekund wiercenia**: kierowca utrzymuje zatrzymane auto przy punkcie przygotowania, a zwiadowca osłania bank. Utrata osłony przerywa postęp wiercenia. Na koniec wszyscy uczestnicy muszą dotrzeć do kryjówki, a kierowca prowadzić auto.

Przy dwóch osobach kierowca wykonuje również zwiad, a haker otwiera skarbiec; przy trzech dochodzi zwiadowca, przy czterech osobny włamywacz. Każdy widzi cel swojej roli na GPS i instrukcję w panelu. Rozłączenie wymaganej roli, przekroczenie czasu albo przerwanie kończy napad bez nagrody. Gospodarz rozlicza nagrody i reputację tylko raz.

### Poker i portfel pokoju

W kasynie podejdź do stołu i użyj **E**. Każdy gracz osobno zajmuje miejsce za **$200**. Gdy usiądą co najmniej dwie osoby, można rozdać karty. Przy stole online decyzje podejmują ludzie; gospodarz sprawdza kolejność akcji, rozlicza pule i przekazuje każdemu tylko jego prywatne karty. Na ruch jest **30 sekund**; po upływie czasu gracz czeka, jeśli może, albo pasuje.

Online dostajesz osobny, sesyjny portfel **$1250**. Wpisowe, wygrane, zakupy w garażu i wypłaty z aktywności nie zmieniają lokalnego zapisu trybu solo. Odejście od stołu zwraca niewykorzystane żetony do portfela pokoju. Salda, garaż online, wyniki bieżących aktywności i pokój nie są zapisywane po zakończeniu sesji.

Połączenia korzystają z WebRTC i sygnalizatora PeerJS. Gospodarz utrzymuje pokój w swojej przeglądarce — musi pozostawić stronę otwartą. Jego rozłączenie kończy sesję pozostałych osób. Publiczny sygnalizator i serwery ICE muszą być dostępne z sieci graczy. Bez konfiguracji TURN gra korzysta z połączeń bezpośrednich; mogą one nie działać między różnymi sieciami. Po dodaniu własnej konfiguracji klient korzysta z adresów i transportów podanych przez dostawcę TURN. Całkowita blokada tych serwerów w sieci może uniemożliwić dołączenie. Po błędzie można ponowić dołączanie lub utworzyć nowy pokój.

Panel pokazuje osobno łączenie z serwerem pokojów, połączenie z gospodarzem i potwierdzenie wejścia. Wolniejsza negocjacja sieciowa nie zużywa już czasu przeznaczonego na potwierdzenie pokoju. Gdy gospodarz chwilowo traci serwer pokojów, działająca ekipa może grać dalej, a kod i zaproszenie wracają po automatycznym przywróceniu połączenia. Komunikat o innej wersji gry wymaga odświeżenia strony u obu osób i utworzenia nowego pokoju.

## Reputacja, kontakty i domy

**L** otwiera panel kontaktów i kryjówek. W trybie solo ukończone zwykłe misje dają 50 reputacji. Dostępna od początku **Nova** zleca przewóz paczki za **$300 i 60 REP**; **Milo** otwiera trasę portową od 100 REP, a **Vera** pieszy zwiad od 300 REP. Cele zaliczają się po dotarciu we właściwej kolejności; panel pokazuje czas i trasę. Można powtarzać zlecenia jako nowe wyprawy. Aktywne zlecenie nie jest wznawiane po przeładowaniu.

**Mieszkanie nad kanałem** kosztuje **$900**, a **Loft Ocean View** **$2600** i wymaga 200 REP. Kup lokal, wyznacz trasę, podejdź pieszo do jego drzwi i użyj **E**. W środku można swobodnie chodzić, rozglądać się i podejść do stołu planowania. Przy wyjściu ponownie **E** wraca na ulicę.

Wyposażenie jest widoczne we wnętrzu: kanapa za **$160** umożliwia odpoczynek i odnowienie zdrowia, neon za **$120** zmienia salon, a stanowisko mechanika za **$300** pozwala naprawiać własne auto przy domu za **$35**. Panel parkingu przechowuje zakupione modele: zatrzymaj własne auto przy mieszkaniu i wybierz zaparkowanie; odbierz je w tym samym panelu przy domu. Przechowywanego auta nie można po prostu przejąć klawiszem E.

Online gospodarz może kupić wspólny **Dockhouse za $1800** i umeblować go dla całej ekipy. Wszyscy członkowie pokoju mogą wejść do bazy i widzą się w jej wnętrzu. Gospodarz przy stole planowania otwiera **J** i rozpoczyna napad lub wyścig; ekipa wychodzi wtedy na ulicę. Własne domy, reputacja, wyposażenie i parking solo zapisują się lokalnie. Ich odpowiedniki online, wspólna baza i jej zakupy należą do bieżącego pokoju i nie zmieniają profilu solo.

## Pościgi i duże wydarzenia uliczne

Po ulicach jeżdżą patrole. Przy drugim poziomie poszukiwania policja rozstawia fizyczne blokady, a przy trzecim dołącza helikopter. Po zerwaniu kontaktu wzrokowego policjanci przeszukują ostatnią znaną pozycję. Przy **(-80, 0)** jest oznaczona kryjówka: zgub kontakt, zatrzymaj się i pozostań niezauważony przez **6 sekund**, aby zakończyć pościg. Prześwity przy blokadach pozwalają je ominąć. Policja pozostaje osobistą symulacją każdego gracza, także w pokoju online.

Pierwsze duże wydarzenie pojawia się po **45 sekundach**, kolejne co **4 minuty**, z **3 minutami** na wykonanie. **B** pokazuje zasady, uczestników i dołączanie; GPS prowadzi do aktualnego celu. Online gracze rywalizują o jeden ładunek i jedną nagrodę:

- **Konwój, $650:** dołącz, podjedź obok opancerzonego auta i rozpocznij przejęcie przez E. Utrzymaj się blisko przez 3 sekundy, zalicz punkt kontrolny, dostarcz ładunek i zatrzymaj się przy odbiorcy.
- **Poszukiwany Sentinel, $550:** przejmij wskazane auto, potwierdź odbiór, zalicz trasę i dostarcz samochód z co najmniej 30% stanu.
- **Rywalizacja kurierów, $450:** odbierz wspólną przesyłkę jako pierwszy, przejedź przez punkt kontrolny i potwierdź dostawę po zatrzymaniu.

Zwycięzca otrzymuje także 80 reputacji. Znacznik porzuconego auta śledzi jego ostatnią pozycję. Te wydarzenia działają obok dotychczasowych krótkich okazji w mieście.

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

W środowisku chmurowym można użyć `npm ci --cache /workspace/.npm-cache`. `src/game.ts` zawiera logikę i fizykę, `src/world.ts` scenę Three.js, a `src/main.ts` interfejs i wejście. `src/garage.ts` rozlicza zakupy i tuning, `src/city-life.ts` czas, pogodę i wydarzenia, a `src/online-jobs.ts` napad i wyścigi. `src/casino-view.ts` buduje kasyno; `src/poker.ts` odpowiada za zasady i boty, a `src/poker-ui.ts` za interfejs stołu. `src/room-authority.ts` prowadzi pokój, portfele, przejazdy i wspólny stół; `src/multiplayer-client.ts` obsługuje połączenia WebRTC.

Testy Playwright wymagają Chromium. Obsługiwany jest `CHROMIUM_PATH`, lokalne `/usr/bin/chromium` lub oficjalny browser z `npx playwright install chromium`. Domyślnie testowany jest **gotowy `dist` pod `/school_project/` na porcie 5185**. `NEON_BASE_URL` pozwala wskazać inny serwer. Grafika i audio powstają programowo; tryb solo nie wymaga zewnętrznych zasobów.

Testy multiplayer uruchamiają lokalny PeerServer na porcie **9000**, serwer TURN/TCP na **3478** (kontrola gotowości: **9002**) i dwie niezależne przeglądarki. Połączenia przechodzą przez prawdziwy serwer TURN, co sprawdza również sieci blokujące bezpośredni ruch UDP. Sprawdzają prawdziwe połączenia WebRTC, ruch graczy, rozdanie, prywatność kart, wypłaty i rozłączenie gospodarza. Nie zastępują weryfikacji publicznego sygnalizatora ani połączeń pomiędzy różnymi sieciami. Ustawienie serwera testowego jest wstrzykiwane wyłącznie na adresie loopback; gotowa strona korzysta z publicznej konfiguracji PeerJS.

Regresja dołączania celowo opóźnia odpowiedź sieciową gospodarza o 18 sekund, zachowując prawdziwe połączenia WebRTC i TURN. Sprawdza, że host nie zamyka trwającej negocjacji oraz że po połączeniu gracze widzą swój ruch. Testy klienta osobno sprawdzają limity kolejnych etapów, anulowanie, niezgodną wersję i ponawianie sygnalizacji.

### Połączenia między różnymi sieciami: TURN

Publiczny sygnalizator PeerJS nadal działa, ale darmowe serwery TURN tej biblioteki zostały [wyłączone przez jej autorów](https://github.com/peers/peerjs/issues/1172). Nie wystarczy pozostawić historycznej konfiguracji `eu-0.turn.peerjs.com` i `us-0.turn.peerjs.com`. W tej grze nie są już używane jako domyślne serwery pośredniczące.

Aby uruchomić niezawodne pośrednictwo dla własnej gry:

1. Utwórz konto u dostawcy TURN, np. [Metered Open Relay](https://www.metered.ca/tools/openrelay/), albo przygotuj własny serwer coturn. Pobierz **konfigurację klienta ICE**: adresy `turn:`/`turns:`, `username` i `credential`.
2. W repozytorium otwórz **Settings → Environments → TURN_ICE_SERVERS**. Dodaj w nim **Environment secret** o nazwie **`TURN_ICE_SERVERS`**. Jako wartość wklej tablicę JSON od dostawcy, bez otaczających cudzysłowów z przykładu `.env`. Zarówno budowanie, jak i diagnostyka korzystają z tego środowiska. Obsługiwany jest również sekret repozytorium o tej samej nazwie, jeżeli środowisko nie definiuje własnej wartości.
3. Uruchom **Actions → Deploy Neon Coast → Run workflow → main**. Workflow przekazuje tę konfigurację do kompilacji. Nieprawidłowy JSON, adresy i brak danych klienta zatrzymują budowanie z komunikatem, który nie ujawnia wartości konfiguracji.
4. Uruchom **Actions → Diagnose public room connections → Run workflow → main**. Ta osobna próba tworzy dwa testowe profile przeglądarki, korzysta z publicznej sygnalizacji i wymusza przejście przez skonfigurowany TURN. Sukces wymaga dwóch graczy w pokoju oraz rzeczywiście wybranych kandydatów relay. Wynik i oczyszczona diagnostyka są w podsumowaniu i artefakcie tego uruchomienia.
5. Odśwież grę u obu osób i utwórz nowy pokój.

Przykładowy **kształt** wartości sekretu; adres i dane trzeba zastąpić otrzymanymi od dostawcy:

```json
[
  {
    "urls": ["turns:turn.example.com:443?transport=tcp"],
    "username": "YOUR_TURN_USERNAME",
    "credential": "YOUR_TURN_CLIENT_PASSWORD"
  }
]
```

Są to dane **klienta TURN**, które przeglądarka musi otrzymać do połączenia. Nie wklejaj klucza administracyjnego API dostawcy. Wartości `VITE_` trafiają do publicznej kompilacji; GitHub Secret chroni je przed przypadkowym zapisaniem w repozytorium i logach, ale nie ukrywa ich przed klientem gry.

Lokalnie skopiuj `.env.example` do `.env.local` w katalogu repozytorium i ustaw `VITE_ICE_SERVERS`. Pliki lokalnego środowiska są ignorowane przez Git. Pusta konfiguracja oznacza tryb bezpośredni, opisany w panelu Online. Nie potwierdza dostępności połączeń między różnymi sieciami.

### Własny sygnalizator

Lokalny serwer można uruchomić poleceniem `node scripts/serve-peers.mjs`. Do pracy z nim uruchom klienta z ustawieniami:

```sh
VITE_PEER_HOST=127.0.0.1 VITE_PEER_PORT=9000 VITE_PEER_PATH=/peerjs VITE_PEER_SECURE=false npm run dev
```

Własny serwer produkcyjny konfiguruje się przez te same zmienne `VITE_PEER_HOST`, `VITE_PEER_PORT`, `VITE_PEER_PATH` i `VITE_PEER_SECURE` przed budowaniem. Strona HTTPS, w tym GitHub Pages, wymaga sygnalizatora HTTPS/WSS. Nie publikuj kompilacji ze wskazaniem lokalnego serwera testowego.

## Publikacja

`npm run build` odświeża `dist` i gotową kopię w katalogu głównym: `index.html`, `assets`, favicon oraz `.nojekyll`. Pages może korzystać z `main / (root)` lub z workflow **Deploy Neon Coast** publikującego `dist`.

Workflow sprawdza typy, testy logiki, budowanie i testy przeglądarkowe. Raporty awarii zachowuje w artefakcie. W wariancie Actions ustaw **Settings → Pages → Source → GitHub Actions**. Nie publikuj źródłowego `app/index.html` bez kompilacji.
