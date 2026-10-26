# Grid Legends: Echoes of the Void — projekt gry

Wersja 0.1 · propozycja do implementacji · język gry: polski, struktura gotowa do lokalizacji.

## 1. Wizja i granice projektu

**Obietnica:** widzisz nadchodzącą katastrofę, ale masz sześć punktów akcji i trzy różne sposoby, by zmienić jej przebieg. Najlepsza tura nie musi zadawać największych obrażeń — może sprawić, że przeciwnik zniszczy własnego sojusznika.

Gra łączy czytelne zapowiedzi zagrożeń i manipulowanie pozycjami z Into the Breach z komplementarnymi rolami drużyny i wyborem nagród znanymi z turowego fantasy. Nie odtwarza ekonomii miast, wielkich armii ani mapy strategicznej Heroes III.

Filary projektu:

1. **Uczciwa informacja:** brak losowych trafień, uników i krytyków. Podgląd pokazuje faktyczne skutki, w tym obrażenia sojuszników.
2. **Taktyka pozycji:** pchnięcia, zamiany, osłony i pułapki zmieniają wynik zapowiedzianych ataków.
3. **Trzy role, jedna drużyna:** każdy Strażnik ma zastosowanie od pierwszej walki; żadna klasa nie jest dodatkiem do głównego bohatera.
4. **Krótka porażka, wartościowa wiedza:** run trwa docelowo 30–45 minut, a gra zapisuje postęp po każdej zatwierdzonej akcji.
5. **Mrok bez utraty czytelności:** pixel-art buduje atmosferę, ale efekty nie zasłaniają kafelków i zagrożeń.

Wymagania potwierdzone: tytuł, Aetheria i Pustka, Zakon Światła, trójka bohaterów i sześć opisanych zdolności, siatka 8×8, turowe walki, roguelite, dark-fantasy/pixel-art. System PA, konkretne statystyki, przeciwnicy, cele, progresja i zakres poniżej są propozycją, ponieważ przesłana wiadomość urywa się przed ich opisem.

## 2. Świat i opowieść

Aetheria istnieje dzięki Rdzeniom Rzeczywistości, które utrzymują prawa materii i pamięci. Wieża Pustki pojawia się jednocześnie we wszystkich miejscach, z których zniknął Rdzeń. Jej piętra nie są kolejnymi wysokościami budowli: to coraz głębsze warstwy uszkodzonego świata.

Pustka objawia się kafelkowymi ubytkami, powtarzającymi się fragmentami krajobrazu i przerwami w dźwięku. Cyfrowe pęknięcia stanowią język wizualny rozpadu, bez sugerowania od początku, że Aetheria jest symulacją.

Zakon Światła wysyła ostatnich Strażników:

- **Ignis** pamięta imiona tych, których nie zdołał ochronić. Ufa ślubowaniom i podejrzewa, że reset odbiera im znaczenie.
- **Kael** rozpoznaje w Wieży drogi, którymi nigdy nie szedł. Zbiera ślady poprzednich linii czasowych i podważa kroniki Zakonu.
- **Lyra** zachowuje pojedyncze wspomnienia resetów. Każdy uratowany Rdzeń pozwala jej odtworzyć fragment prawdy o pierwszym pęknięciu.

Pierwsza wyprawa przedstawia odzyskiwanie Rdzeni jako bezwarunkowe dobro. Dalsze odkrycia wskazują, że Zakon podtrzymywał Aetherię kosztem wymazywania innych możliwych światów. Finał docelowej gry daje wybór: odtworzyć stary porządek, otworzyć kontrolowane przejścia lub przerwać cykl. Wybór zmienia zakończenie i warianty kolejnych wypraw, nie odbiera wcześniej odblokowanej zawartości.

Dialogi między walkami trwają 2–4 kwestie. W walce bohaterowie komentują pierwsze użycie mechaniki lub zmianę fazy bossa, bez powtarzających się komunikatów co turę. Tekst można przewijać i ponownie odczytać w kronice.

## 3. Pętla gry i zakres zawartości

**Pętla walki:** odczytaj intencje → sprawdź podglądy → wykonaj akcje dowolnymi Strażnikami → zatwierdź koniec tury → obejrzyj rozstrzygnięcie → dostosuj plan.

**Pętla wyprawy:** wybierz trasę → rozegraj komnatę → wybierz jedną z trzech nagród → przejdź do następnej komnaty → odzyskaj Rdzeń lub ponieś porażkę → wróć do Archiwum z odblokowaniami.

| Element | Pierwszy grywalny zakres (MVP) | Pełna wersja docelowa |
| --- | --- | --- |
| Drużyna | 3 bohaterów, 6 umiejętności | te same role, alternatywne zestawy |
| Wyprawa | 3 komnaty, 10–15 minut | 3 sektory po 3 walki, 30–45 minut |
| Przeciwnicy | 2 archetypy + mini-boss | 6–8 archetypów + 3 bossowie |
| Plansze | 3 ręcznie przygotowane mapy 8×8 | biblioteka szablonów i kontrolowane warianty |
| Nagrody | 6 reliktów, wybór 1 z 3 po pokojach 1 i 2 | około 18 reliktów i wydarzenia |
| Roguelite | reset runu, Echa, 2 odblokowywane relikty | alternatywne zdolności, kronika, modyfikatory |
| Platforma | przeglądarka desktop, mysz + klawiatura | responsywny tablet i dopracowany dotyk |

MVP jest ukończoną krótką wyprawą z początkiem, finałem i ponowną próbą. Nie obejmuje multiplayera, kont, chmury, edytora poziomów, otwartego świata ani proceduralnego generowania dowolnych plansz.

## 4. Siatka, teren i cele

Plansza ma 64 pola; współrzędne logiczne `(x, y)` należą do `0…7`. Interfejs pokazuje kolumny A–H i wiersze 1–8. Odległość to Manhattan: `|dx| + |dy|`. Ruch i sąsiedztwo są ortogonalne, bez przekątnych.

Na jednym polu stoi najwyżej jedna jednostka. Zwłoki nie blokują przejścia. Dobrowolny ruch nie przechodzi przez żadną jednostkę, nawet sojuszniczą.

| Teren / obiekt | Ruch | Ataki i przemieszczenia |
| --- | --- | --- |
| Posadzka | koszt 1 kroku | bez modyfikatora |
| Ściana | blokuje | blokuje strzały; kolizja rani pchanego |
| Otchłań | nie można wejść dobrowolnie | nie blokuje pocisku; wepchnięta jednostka ginie |
| Krucha osłona, 2 HP | blokuje do zniszczenia | zatrzymuje pocisk; przyjmuje obrażenia i kolizje |
| Obelisk, 6 HP | blokuje | cel obrony; można go uszkodzić, również własnym AoE |
| Sidła | teren pozostaje przechodni | osobna warstwa pułapek; reaguje tylko na wroga |

Nie ma spadania poza planszę: jej krawędź działa jak nieprzekraczalna ściana. Wepchnięcie w istniejący kafelek Otchłani zabija jednostkę, a pchnięcie poza współrzędne planszy powoduje kolizję.

Po zniszczeniu kruchej osłony zostaje posadzka. Pchnięcie, które zniszczy osłonę obrażeniami kolizyjnymi, **nie** przenosi już celu na zwolniony kafelek. Obelisk nie jest jednostką i nie podlega zamianie.

Cele MVP:

1. **Próg Wieży:** pokonaj 3 Puste Łuski; Obelisk musi przetrwać. Pierwsza mapa nie zawiera otchłani i uczy ruchu, strzału, tarczy oraz zapowiedzi.
2. **Pęknięta Galeria:** pokonaj 2 Łuski i 2 Ciernie; zachowaj Obelisk. Plansza wprowadza otchłanie, osłony, sidła i zamianę.
3. **Komnata Echa:** pokonaj Strażnika Szczeliny i 2 Ciernie; zachowaj Obelisk. Po zwycięstwie odzyskujesz pierwszy Rdzeń i kończysz krótką wyprawę.

W MVP nie ma ukrytych posiłków. Pełna wersja może dodawać fale, ale pole pojawienia się, typ wroga i runda przybycia muszą być widoczne z co najmniej jedną fazą gracza wyprzedzenia; zablokowany portal opóźnia pojawienie się, nie nadpisuje jednostki.

## 5. Rundy i punkty akcji

**Runda** obejmuje fazę gracza, fazę przeciwników i rozliczenie. Bohaterowie nie mają oddzielnych, zamykanych aktywacji: można użyć Ignisa, potem Lyry, potem wrócić do Ignisa.

1. Przed pierwszą rundą: rozstawienie, ustalenie kolejności i intencji wrogów.
2. Początek fazy gracza: każdy żywy bohater otrzymuje **2 PA**, a stare tarcze wygasają. Niewykorzystane PA z poprzedniej rundy przepadają.
3. Gracz wykonuje legalne ruchy i umiejętności. Każde zatwierdzenie natychmiast aktualizuje pełny podgląd fazy przeciwników.
4. „Zakończ turę” otwiera krótkie potwierdzenie, jeśli pozostały PA. Można je wyłączyć w ustawieniach. Gra nie kończy fazy automatycznie po wydaniu ostatniego PA.
5. Przeciwnicy realizują zapisane intencje w widocznej kolejności. Martwy wróg nie działa. Nie zmieniają celów ani tras na korzystniejsze.
6. Rozliczenie: wygasanie efektów, sprawdzenie celu, zwiększenie numeru rundy, zaplanowanie następnych intencji, nowa faza gracza.

**Ruch:** koszt 1 PA, maksymalna liczba pól zależy od klasy. Można wykonać dwa ruchy w jednej fazie. Wskazanie celu pokazuje konkretną ścieżkę; dopiero potwierdzenie ją wykonuje. Ruch o zero pól jest nielegalny. Droga jest obliczana BFS, z deterministyczną kolejnością sąsiadów N, E, S, W.

**Umiejętności:** koszt według tabeli. Każdą zdolność można użyć najwyżej raz w rundzie; dwie różne zdolności są dozwolone, jeśli wystarcza PA. Nie istnieje osobny, nieopisany „atak podstawowy”.

**Odnowienie C:** minimalny odstęp numerów rund między użyciami. Użycie w rundzie `r` ustawia `readyRound = r + C`. Dla C=2 użycie w rundzie 3 oznacza dostępność od rundy 5. Interfejs pokazuje „Dostępne w rundzie 5”, zamiast niejednoznacznego „2 tury”. C=1 oznacza ponowne użycie od następnej rundy.

Nielegalna komenda nie zużywa PA, nie uruchamia odnowienia ani animacji i nie zmienia zapisu. MVP nie ma cofania akcji; anulowanie wyboru przed potwierdzeniem jest zawsze darmowe. Pełny podgląd i dwustopniowe potwierdzenie zastępują niejasne kliknięcia. Cofanie całej fazy pozostaje opcją późniejszej wersji i wymaga osobnego projektu zapisu oraz konsekwencji fabularnych.

## 6. Strażnicy i sześć umiejętności

Statystyki są punktami startowymi do testów, nie deklaracją gotowego balansu.

| Bohater | HP | Ruch za 1 PA | Specjalizacja |
| --- | ---: | ---: | --- |
| Ignis | 12 | 3 | ochrona i wymuszone przemieszczenie |
| Kael | 8 | 4 | daleki strzał i blokowanie podejścia |
| Lyra | 7 | 3 | przebudowa pozycji i obrażenia obszarowe |

Nie ma many, procentowej obrony ani losowego krytyka w MVP. Liczby obrażeń pozostają małe i czytelne. Obrażenia najpierw zużywają tarczę, a nadmiar odejmuje HP. Tarcza nie chroni przed wpadnięciem do otchłani.

### Ignis

**Pchnięcie Tarczą — 1 PA, C=1.** Wybierz sąsiedniego przeciwnika. Zadaj 2 obrażenia, a jeśli przeżył, przesuń go o jedno pole w kierunku od Ignisa.

- Wolna posadzka: cel trafia na nią, następnie uruchamia znajdującą się tam pułapkę.
- Otchłań: natychmiastowa śmierć bez dodatkowego rzutu obrony.
- Ściana lub krawędź: 1 dodatkowe obrażenie celu, bez przesunięcia.
- Jednostka: 1 dodatkowe obrażenie obu jednostek; bez łańcucha pchnięć.
- Osłona lub Obelisk: 1 dodatkowe obrażenie pchanego i obiektu; cel zostaje w miejscu.
- Śmierć od pierwszych 2 obrażeń: nie wykonuj pchnięcia ani kolizji.

Podgląd ostrzega o uszkodzeniu sojusznika lub Obelisku. Pchnięcie wybiera tylko wroga, ale pośrednia kolizja może zranić drużynę.

**Mur Światła — 1 PA, C=2.** Ignis i żywi sojusznicy na czterech sąsiednich polach otrzymują tarczę 3. Efekt dotyczy jednostek obecnych w chwili rzucenia; nie jest poruszającą się aurą. Tarcze nie sumują się: zostaje większa z wartości istniejącej i nowej. Wygasają na początku następnej fazy gracza.

### Kael

**Precyzyjny Strzał — 1 PA, C=1.** Wybierz jeden z czterech kierunków; zasięg 6 pól, 3 obrażenia. Pocisk zatrzymuje pierwsza jednostka, ściana, osłona lub Obelisk. Nie przechodzi przez sojuszników i nie strzela po przekątnej. W MVP gracz może potwierdzić strzał tylko wtedy, gdy pierwszym trafionym obiektem jest przeciwnik lub krucha osłona. Strzał w pustą przestrzeń nie zużywa PA, bo nie jest legalnym celem.

**Sidła Pustki — 1 PA, C=2.** Umieść sidła na wolnej posadzce w odległości Manhattan do 3. Magiczne ustawienie nie wymaga linii widzenia. Nie można rzucić pułapki pod jednostkę, obiekt ani inną pułapkę. Maksymalnie 2 aktywne sidła drużyny; osiągnięcie limitu blokuje nowe użycie z czytelnym komunikatem.

Sidła czekają do końca fazy przeciwników rundy `r+2`, jeśli powstały w rundzie `r`. Wejście wroga — dobrowolne, wskutek pchnięcia lub zamiany — zużywa pułapkę, zadaje 1 obrażenie i nakłada unieruchomienie na najbliższą aktywację wroga. Sojusznicy przechodzą bez uruchamiania.

Unieruchomienie blokuje dobrowolny ruch, ale nie atak, pchnięcie ani zamianę. Jeżeli pułapka aktywuje się podczas wykonywania intencji ruchu, zatrzymuje bieżący ruch i jej unieruchomienie zostaje zużyte w tej samej aktywacji. Jeżeli wywoła ją gracz podczas swojej fazy, efekt obejmuje najbliższą fazę przeciwników. Przy intencji ataku wróg może zaatakować, po czym efekt wygasa. Nie należy opisywać sideł jako ogłuszenia.

### Lyra

**Pętla Czasowa — 1 PA, C=2.** Wybierz dwie różne żywe jednostki stojące na planszy. Zasięg obejmuje całe 8×8; nie ma wymogu widoczności ani wykluczenia bossów. Dozwoleni są sojusznicy, przeciwnicy i sama Lyra. Obiekty terenowe nie są jednostkami.

Zamiana jest atomowa. Nie odświeża PA, HP, tarcz, odnowień, unieruchomień ani kolejności inicjatywy. Po jednoczesnej zmianie pozycji rozlicz wejście na sidła w kolejności stabilnych ID jednostek. Jednostki nie mogą zostać zamienione z pustką, wolnym polem ani Obeliskiem. Zamiana nie anuluje intencji sama z siebie — zmienia jej możliwe wykonanie.

**Uderzenie Pioruna — 2 PA, C=2.** Wybierz lewy górny kafelek kwadratu 2×2 w odległości Manhattan do 4 od Lyry. Wszystkie cztery pola muszą istnieć na planszy, więc kotwica ma współrzędne 0…6. Zasięg sprawdza się do kotwicy, nie do dowolnego trafionego pola. Brak wymogu linii widzenia.

Każda jednostka, osłona i Obelisk w obszarze otrzymuje 2 obrażenia. Sojusznicy także. Trafienia w obrębie jednego pioruna są jednoczesne; wszystkie śmierci rozlicza się po odjęciu obrażeń. Wymagane jest trafienie co najmniej jednego przeciwnika lub kruchej osłony, aby nie marnować PA na pusty obszar. Piorun zużywa oba PA: Lyra nie może w tej samej rundzie najpierw się poruszyć ani zamienić jednostek, chyba że przyszły jawny efekt zmieni koszt. W MVP takich efektów nie ma.

## 7. Kolejność efektów i rozstrzyganie walki

Każda komenda przechodzi walidację na bieżącym stanie, po czym koszt i odnowienie są pobierane dokładnie raz. Następnie wykonuje się całą operację:

1. Główne obrażenia lub atomowa zmiana pozycji.
2. Usunięcie jednostek zabitych głównym trafieniem.
3. Pchnięcie, kolizja i ich obrażenia; albo test wejścia po zamianie.
4. Pułapki na polach wejścia; nie uruchamiają się wielokrotnie na tym samym wejściu.
5. Usunięcie kolejnych zabitych i zniszczonych obiektów.
6. Ocena porażki, potem zwycięstwa; zapis i podgląd nowego stanu.

Porażka następuje przy zniszczeniu Obelisku albo śmierci całej drużyny. Jeśli ostatni wróg i Obelisk zginą w jednej atomowej operacji, wynik to porażka. Śmierć pojedynczego Strażnika usuwa go z walki do końca komnaty, lecz nie usuwa jego ulepszeń. Po zwycięstwie polegli wracają z połową maksymalnego HP, zaokrągloną w górę, a pozostali odzyskują 2 HP, najwyżej do maksimum. Na początku następnej komnaty PA i umiejętności są gotowe; tarcze, pułapki i statusy wygasają. Obelisk nowej komnaty ma 6 HP.

## 8. Przeciwnicy i czytelne AI

Wróg planuje **jedną intencję: atak albo ruch**, nigdy ukryty ruch zakończony dodatkowym atakiem. Ruch w tej rundzie oznacza zagrożenie atakiem dopiero w następnej. Tę prostą regułę pokazuje samouczek.

Planowanie odbywa się wyłącznie między rundami, na migawce planszy. Podczas fazy gracza intencje są zablokowane. Podgląd ich skutków jest jednak przeliczany po każdej zmianie stanu.

- **Atak kierunkowy:** kierunek N/E/S/W jest stały, ale początek ataku to aktualna pozycja napastnika. Pchnięcie i zamiana mogą przekierować linię na wroga lub w pustą przestrzeń. Pocisk trafia pierwszy blokujący obiekt; wrogowie mogą zranić siebie nawzajem.
- **Atak obszarowy:** zapisany kwadrat pozostaje w bezwzględnych współrzędnych planszy; nie podąża za dawnym celem. Śmierć rzucającego anuluje atak. Zmiana jego pozycji nie przesuwa kwadratu.
- **Ruch:** zapisany jest bezwzględny ciąg pól. Każdy krok musi nadal sąsiadować z bieżącą pozycją i być wolny. Pierwszy nielegalny krok kończy ruch; wróg nie szuka obejścia. Root blokuje cały ruch. Zamiana może spowodować, że zapisana trasa nie rozpoczyna się już obok wroga, i w ten sposób ją przerwać.

| Wróg | HP / ruch | Intencja ataku | Priorytet przy planowaniu |
| --- | --- | --- | --- |
| Pusta Łuska | 4 / 2 | 2 obrażenia na sąsiednie pole w wybranym kierunku | Obelisk w zasięgu, potem bohater z najmniejszym HP |
| Krwawy Cierń | 3 / 2 | pocisk 2 obrażenia, zasięg 6, jeden kierunek | bohater z najmniejszym HP, potem Obelisk |
| Tkacz Szczelin | 5 / 1 | 2 obrażenia w zapowiedzianym kwadracie 2×2; brak wymogu LOS i zasięgu | obszar z największą sumą obrażeń bohaterów i Obelisku |
| Strażnik Szczeliny | 12 / 1 | pocisk 3 obrażenia, zasięg 7; N/E/S/W | Obelisk w zasięgu, potem bohater z najmniejszym HP |

MVP wykorzystuje Łuski, Ciernie i Strażnika; Tkacz jest pierwszym rozszerzeniem po MVP. Boss zajmuje jeden kafelek i podlega normalnym zasadom pchnięcia, zamiany, sideł oraz otchłani. Wygrana przez środowisko jest prawidłowym rozwiązaniem, nie exploitem do usunięcia odpornością.

Przy porównywaniu celów „bohater z najmniejszym HP” oznacza bieżące HP, nie procent maksymalnego HP. Atak przy planowaniu jest dopuszczalny tylko wtedy, gdy jego symulacja trafia zamierzony cel zgodnie z zasięgiem i blokowaniem; AI nie wybiera celowo trafienia własnego sojusznika. Późniejsza zmiana sytuacji może jednak taki strzał wymusić. Przy kilku równorzędnych celach: najpierw niższy identyfikator celu; dla obszaru — niższe y, potem x; dla kierunku — N, E, S, W. Jeśli żaden atak nie może trafić zamierzonego celu, wróg szuka BFS-em ścieżki do pozycji umożliwiającej atak na swój priorytetowy cel i planuje do limitu ruchu. Dla równych ścieżek obowiązuje ten sam porządek sąsiadów. Brak trasy daje intencję oczekiwania.

Kolejność wrogów zostaje ustalona przy wejściu do komnaty według inicjatywy archetypu, a remis rozstrzyga stabilne ID. Propozycja inicjatywy: Cierń 10, Łuska 20, Tkacz 30, Strażnik 40. Niższa liczba działa wcześniej. Zamiana pozycji tej kolejności nie zmienia.

**Pełny podgląd fazy** symuluje wrogów kolejno, uwzględnia śmierci, zniszczenia, pierwszego trafionego i zajętość pól. Nie wolno pokazywać izolowanych strzałek, które ignorują wcześniejsze wydarzenia tej samej fazy. Tablica intencji opisuje „ruch przerwany”, „atak w sojusznika” lub przewidywane obrażenia, jeśli sytuacja się zmieniła.

## 9. Przykład synergii

Stan testowy, współrzędne od zera:

- Ignis `(2,4)`, Lyra `(5,5)`, Kael `(1,6)`, Obelisk `(3,3)`.
- Łuska `(3,4)` planuje uderzenie na zachód w Ignisa.
- Cierń `(6,3)` planuje strzał na zachód w Obelisk; pola `(5,3)` i `(4,3)` są puste.
- Otchłań jest na `(4,4)`.

Lyra za 1 PA zamienia Łuskę i Cierń. Łuska stoi teraz na `(6,3)` i nadal uderzy na zachód — w puste `(5,3)`. Cierń stoi na `(3,4)` i nadal strzela na zachód, więc grozi Ignisowi. Ignis za 1 PA popycha Cierń na wschód: pierwsze 2 obrażenia nie zabijają wroga z 3 HP, a wejście w Otchłań go usuwa. Dwa zagrożenia rozwiązano dwoma PA, bez błędnego założenia, że zamiana odświeża akcje albo zmienia kierunek intencji.

## 10. Roguelite, nagrody i powracanie

Wyprawa zaczyna się od pełnej drużyny, bez reliktów z poprzedniego runu. HP i zdobyte relikty przenoszą się między komnatami bieżącej wyprawy. Nie ma osobnej puli regenerowanych mikstur w MVP.

Po zwycięstwie w komnacie niebędącej finałem gracz wybiera jeden z trzech różnych dostępnych reliktów. Relikty już posiadane w bieżącym runie są wykluczone z losowania; ich efekty nie stackują. Gdyby w rozszerzonej zawartości zostało mniej niż trzy, pokaż wszystkie dostępne; pusta pula pomija wybór i pozwala kontynuować wyprawę. W MVP początkowa pula sześciu reliktów i dwa wybory nigdy nie prowadzą do wyczerpania. W MVP po przejściu dwóch pierwszych komnat ma dwa relikty. Propozycje startowej puli:

| Relikt | Efekt |
| --- | --- |
| Pieczęć Strażnika | Mur Światła daje 4 zamiast 3 tarczy |
| Ciężar Przysięgi | pierwsze trafienie Pchnięcia zadaje 3 zamiast 2 obrażeń |
| Soczewka Zmierzchu | Precyzyjny Strzał ma zasięg 7 zamiast 6 |
| Zęby Pustki | sidła zadają 2 zamiast 1 obrażenia |
| Żywa Iskra | Piorun nie rani bohaterów; nadal może uszkodzić Obelisk |
| Bandaże Archiwisty | po zwycięstwie żywi bohaterowie leczą 3 zamiast 2 HP |

Wszystkie 6 reliktów jest dostępnych początkowo. Dwa późniejsze odblokowania rozszerzają pulę: **Podróżny Płaszcz** (+1 ruch Kaela) i **Serce Światła** (+2 maksymalnego HP Ignisa, +2 HP przy zdobyciu, najwyżej do nowego maksimum). Koszty: odpowiednio 3 i 5 Ech. Zamiast trwałego podnoszenia statystyk konta otrzymujemy nowe możliwości nagród.

Za pierwsze ukończenie każdej komnaty w danym runie gracz zdobywa 1 Echo, a za finał dodatkowe 2. Nie ma nagrody za samo rozpoczęcie, reset lub wielokrotne otwieranie ekranu nagrody. Echa są przyznawane w tej samej transakcji zapisu co wynik walki. Porażka usuwa HP, bieżącą trasę i relikty, ale zachowuje Echa, kronikę i odblokowania. Pierwszą wyprawę można wygrać bez metaprogresji.

Pełna wersja dodaje rozgałęzienia trasy i wybory między odpoczynkiem, reliktem oraz wydarzeniem. Bez dziennych obowiązków, energii, reklam przerywających turę i mechanik wymagających farmienia porażek. Wciągająca pętla ma wynikać z lepszego rozumienia gry i zmiennych kombinacji, nie z kary za przerwę.

## 11. Grafika, dźwięk i interfejs

### Kierunek artystyczny

Baza logiczna sceny to 960×640; kafelek 48×48 daje planszę 384×384. Postacie mają bazowe sprite’y 32×32 osadzone w kafelku i czytelne sylwetki: szeroka tarcza Ignisa, kaptur i łuk Kaela, rozświetlony kostur Lyry. Nie używamy perspektywy izometrycznej: widok z góry ułatwia ocenę 8×8.

Paleta bazowa: tło `#0D1024`, posadzka `#22233F`, Pustka `#6D38A8`, magia `#F1CB75`, zagrożenie `#DB5263`, bezpieczny ruch `#65BDB1`, tekst `#ECE8E2`. To wartości startowe; tekst i stany należy sprawdzić kontrastowo przed akceptacją UI.

Neonowa magia ma niewielkie halo, a dynamiczne światło pulsuje wokół aktywnego bohatera, obelisku i pęknięć. W trybie wydajności światło zastępują addytywne sprite’y; nie zmienia to reguł ani zasięgu widzenia. Cząsteczki nie są elementami logiki. Piksele świata używają nearest-neighbor; tekst UI może być renderowany ostrzej w warstwie DOM.

Animacje: ruch 80–120 ms na kafelek; uderzenie 120–180 ms; zamiana 250–350 ms; piorun do 400 ms. Rozstrzygnięcie całej fazy przeciwników powinno mieścić się zwykle w 2–5 sekundach, z trybem ×2 i pominięciem animacji. Krótki hit-stop nie zmienia momentu obliczenia wyniku. Intensywne błyski i drganie ekranu można wyłączyć.

### Układ ekranu

- Góra: nazwa komnaty, cel, numer rundy, stan Obelisku, ustawienia.
- Środek: plansza, współrzędne, obszary ruchu i zagrożeń, znaczniki HP/tarcz.
- Lewa kolumna: trzy karty Strażników z HP, PA, statusami i wyborem jednostki.
- Prawa kolumna: numerowane intencje przeciwników i prognoza konsekwencji.
- Dół: dwie umiejętności wybranego bohatera, koszt, odnowienie, anulowanie i „Zakończ turę”.

Podgląd ruchu używa kropkowanej ścieżki, atak — czerwonego obrysu i ikony miecza, osłona — złotej tarczy, otchłań — wzoru pęknięcia. Kolor zawsze ma odpowiednik w kształcie lub opisie. Wybranie umiejętności pokazuje „HP 4 → 2”, „kolizja: 1” albo „śmierć w Otchłani”, a nie samą animację celu.

Sterowanie desktop: kliknij bohatera lub 1/2/3; Q/W wybiera jego pierwszą/drugą umiejętność; strzałki przenoszą fokus po siatce; Enter zatwierdza; Esc cofa wybór; Tab przechodzi między regionami UI; przycisk końca tury jest osiągalny klawiaturą. Nie przypisujemy go do Spacji, by nie kończyć rundy przypadkiem. Kliknięcie legalnego pola najpierw pokazuje podgląd; osobne potwierdzenie realizuje akcję. Zamiana wymaga wyboru pierwszej jednostki, drugiej, a potem potwierdzenia. Dotyk w późniejszej wersji korzysta z tej samej sekwencji, bez hovera.

MVP wymaga szerokości widoku co najmniej 960 CSS px. Mniejszy ekran otrzymuje czytelny komunikat, zamiast przyciętej planszy. Responsywny układ pionowy i pełna dostępność czytników ekranu to osobny etap; sam DOM nie stanowi dowodu ich ukończenia. Teksty, fokus, kontrast, możliwość gry klawiaturą i redukcja ruchu należą już do MVP.

### Dźwięk

Ambience: niski dron, oddech Wieży, urwane dźwięki kamienia; muzyka dodaje warstwę rytmiczną przy zagrożeniu Obelisku. Każda klasa ma odrębny motyw: metal i ciepły chór Ignisa, suchy świst Kaela, szkliste opóźnienia Lyry. Zapowiedzi, trafienia i zwycięstwo mają krótkie, rozpoznawalne sygnały, zawsze uzupełnione wizualnie.

Audio zaczyna się dopiero po interakcji użytkownika zgodnie z ograniczeniami przeglądarek. Osobne suwaki muzyki i efektów, mute i trwałe ustawienia. Brak dźwięku nie blokuje gry. Assety muszą mieć udokumentowaną licencję; placeholdery są oznaczone i nie udają gotowej oprawy.

## 12. Co należy sprawdzić w playtestach

Projekt nie może obiecać „legendarnej” gry na podstawie dokumentu. Pierwszy prototyp ma odpowiedzieć na konkretne pytania:

- Czy gracz po samouczku rozumie kierunek ataku i potrafi przewidzieć skutki pchnięcia?
- Czy każda z sześciu umiejętności rozwiązuje problem, którego nie rozwiązuje taniej inna?
- Czy Pętla Czasowa z globalnym zasięgiem nie usuwa większości zagrożeń bez kosztownej decyzji?
- Czy Piorun za 2 PA jest wart utraty ruchu i zamiany w tej rundzie?
- Czy sidła wpływają na podejście wrogów wystarczająco często, skoro nie są ogłuszeniem?
- Czy przy reliktach nadal opłaca się chronić Obelisk zamiast zawsze maksymalizować obrażenia?

Pierwsza seria: 5 osób bez wcześniejszej znajomości zasad, po jednej krótkiej wyprawie. Roboczy cel: co najmniej 4 osoby potrafią samodzielnie wyjaśnić jedną sekwencję podgląd → wykonanie. Każde zgłoszenie „podgląd mówił coś innego” traktujemy jako błąd poprawności. Czasy runu i liczby obrażeń są hipotezami do iteracji, nie wynikami przeprowadzonych badań.
