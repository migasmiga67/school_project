# Plan realizacji i kryteria akceptacji

Status początkowy: ukończona propozycja specyfikacji, **brak implementacji**. Żaden poniższy test runtime nie został jeszcze wykonany. Zakres mechanik: [projekt gry](GAME_DESIGN.md); kontrakty: [projekt techniczny](TECHNICAL_DESIGN.md).

## Etapy i zależności

| Etap | Rezultat | Warunek zakończenia |
| --- | --- | --- |
| 1. Fundament | projekt TS/Phaser/Vite, rdzeń siatki, placeholdery | start bez błędów, 8×8, ruch i PA, test legalności |
| 2. Walka | 3 bohaterów, 6 umiejętności, 2 podstawowe archetypy | wszystkie interakcje mechanik i faz działają bez oprawy |
| 3. Taktyczny podgląd | intencje, pełny forecast, klawiatura i potwierdzanie | podgląd równy wykonaniu we wszystkich scenariuszach |
| 4. Krótka wyprawa | 3 mapy, mini-boss, relikty, reset i zapis | pełne przejście zwycięstwa i porażki oraz reload |
| 5. Oprawa i dostępność | pixel-art, audio, efekty, czytelne UI | sterowanie klawiaturą, redukcja ruchu, brak błędów assetów |
| 6. Publikacja i playtest | produkcyjny build na Pages, 5 sesji testowych | publiczna gra działa; raport oddziela błędy od uwag balansowych |

Nie zakładamy terminu na podstawie samej listy funkcji. Harmonogram należy ustalić po etapach 1–2, gdy znane będą koszty animacji, assetów i interfejsu. Rozbudowa do dziewięciu walk następuje dopiero po sprawdzeniu, że krótka wyprawa daje sensowne decyzje.

## Scenariusze akceptacyjne reguł

### PA i legalność

1. Bohater z 0 PA nie wykona akcji przez kliknięcie, skrót ani bezpośrednią komendę.
2. Ignis nie użyje komendy umiejętności Lyry. Martwy aktor i aktor z nieaktualnym ID są odrzucani.
3. Nielegalny cel zachowuje identyczny stan, PA i odnowienia.
4. Kael może przejść 4 pola za 1 PA, Ignis i Lyra po 3; blokada na trasie zmienia legalny zasięg. Drugi ruch zużywa pozostały PA.
5. Użycie C=2 w rundzie 3 jest zablokowane w rundzie 4 i dozwolone od 5. Swap i przełączanie bohaterów nie resetują odnowienia.
6. Piorun kosztuje 2 PA; po ruchu albo zamianie Lyra nie może go rzucić w tej samej fazie. Każda zdolność C=1 nadal jest niedostępna drugi raz w tej samej rundzie.

### Pchnięcia, tarcze, teren

7. Pchnięcie w wolne pole zadaje 2 obrażenia i zmienia pozycję dokładnie o jeden kafelek.
8. Cel zabity głównym trafieniem nie rani stojącej za nim jednostki ani nie uruchamia pułapki.
9. Kolizja z jednostką zadaje po 1 dodatkowym obrażeniu obu, bez łańcucha i nakładania pozycji.
10. Kolizja ze ścianą lub granicą planszy rani cel; wejście na istniejący kafelek otchłani zabija mimo tarczy.
11. Zniszczona kolizją osłona znika, ale pchany nie przemieszcza się w tej samej operacji na jej pole.
12. Mur obejmuje tylko Ignisa i aktualnie ortogonalnie sąsiadujących sojuszników. Tarcza nie sumuje się, nie leczy i wygasa przed następnymi akcjami gracza.
13. Obrażenia 5 przy tarczy 3 odejmują 2 HP. Utrata tarczy jest widoczna w podglądzie.

### Strzały, sidła, zamiana i AoE

14. Precyzyjny Strzał nie przebija sojusznika ani osłony. Otchłań nie blokuje linii. Kierunek diagonalny i zasięg ponad 6 są odrzucane bez reliktu.
15. Sidła można postawić tylko na wolnej posadzce w Manhattan ≤3. Limit dwóch pułapek blokuje trzecią, zamiast usuwać wcześniejszą bez wiedzy gracza.
16. Wejście wroga wywołuje pułapkę raz i ją usuwa; przejście bohatera nie aktywuje sideł.
17. Pchnięcie lub zamiana na sidła zadaje obrażenia i blokuje najbliższy ruch, ale nie zapowiedziany atak. Wymuszone przemieszczenie rooted jednostki nadal jest legalne.
18. Pułapka uruchomiona podczas ruchu wroga przerywa resztę tej ścieżki; root nie przechodzi dodatkowo na następną aktywację. Nieużyta pułapka z rundy 2 znika po fazie przeciwników rundy 4.
19. Swap dwóch dowolnych żywych jednostek jest atomowy, również dla bossa i samej Lyry. Nie pozwala zamienić Obelisku, pustego pola ani jednej jednostki z samą sobą.
20. Jednostki po zamianie zachowują HP, PA, odnowienia i kolejność. Jednostka trafiająca na sidła rozlicza je po zamianie.
21. Piorun trafia dokładnie 4 pola i rani sojuszników oraz Obelisk. Kotwica `(7,7)` jest nielegalna, `(6,6)` mieści się na planszy. Wszystkie ofiary jednego AoE otrzymują obrażenia przed oceną wyniku.
22. Jednoczesne zabicie ostatniego wroga i zniszczenie Obelisku kończy się porażką.

### AI i podgląd

23. Wróg po fazie planowania nie zmienia kierunku, kotwicy ani trasy wskutek przeliczenia podglądu. Przeniesiony atak kierunkowy zaczyna się z jego nowej pozycji.
24. Wróg, który zaplanował ruch, nie wykonuje dodatkowego ataku. Zablokowana trasa kończy się na pierwszym nielegalnym kroku i nie znajduje alternatywy w trakcie wykonania.
25. Wrogi pocisk może trafić innego wroga; zabity wcześniej aktor nie wykonuje swojej intencji.
26. Sekwencja zamiana → pchnięcie z przykładu w GDD kończy się śmiercią Ciernia i pustym uderzeniem Łuski.
27. Dla ręcznych scenariuszy kolizji, AoE, rootów i wzajemnych zabójstw forecast i wykonanie mają identyczny stan końcowy. Podgląd nie modyfikuje wejścia ani profilu.
28. Testy właściwościowe na legalnie wygenerowanych stanach sprawdzają: brak nakładania jednostek, brak żywych jednostek poza planszą/na otchłani, nieujemne PA i HP, identyczne wyniki replaya. Generator testowy nie zastępuje kontroli wygrywalności map.

## Zapis, interfejs i wdrożenie

29. Reload po akcji odtwarza HP, pozycje, PA, pułapki i odnowienia; reload w animacji wrogów odtwarza pełny rozstrzygnięty wynik fazy.
30. Oferta nagród wyklucza relikty już posiadane. Reload na ekranie nagrody zachowuje dokładnie tę samą trójkę; nie przyznaje ponownie Ech. Ponowna transakcja tego samego wyniku jest idempotentna.
31. Po porażce nowy run nie zachowuje reliktów ani obrażeń poprzedniego, lecz zachowuje Echa i odblokowania. Poległy bohater wraca po wygranej komnacie zgodnie z regułą połowy HP.
32. Uszkodzony zapis i niedostępny storage pokazują komunikat, bez cichego kasowania profilu lub udawania udanego zapisu.
33. Samouczek da się ukończyć tylko klawiaturą. Fokus i wybrany bohater są widoczni; dwuklik nie wydaje dwóch komend.
34. Automatyczny scenariusz przeglądarkowy uruchamia walkę, wykonuje legalny ruch i umiejętność, kończy turę i sprawdza oczekiwany wynik HP/pozycji w modelu oraz widoku.
35. Osobny test zwycięstwa i porażki przechodzi przez ekrany nagród i podsumowania. Sam obecny canvas lub tekst przycisku nie wystarcza.
36. Produkcyjny serwer pod `/school_project/` ładuje HTML, moduły, sprite’y i audio bez 404. Konsola nie zawiera nieobsłużonych wyjątków. Nie ma żądania `/src/main.js` ani `/src/main.ts`.
37. Brak podstawowego assetu lub renderera pokazuje czytelny błąd ładowania, a brak opcjonalnego audio/efektu nie uniemożliwia gry.
38. W obsługiwanych aktualnych wersjach Chrome i Firefox seed i komendy dają identyczny wynik. Grywalność, tekst, fokus i błędy ładowania sprawdza się także ręcznie.

## Ryzyka i decyzje przed rozbudową

| Ryzyko | Jak je ograniczamy | Sygnał wymagający zmiany |
| --- | --- | --- |
| Globalny swap rozwiązuje każdą walkę | 1 PA, C=2, brak dodatkowego Pioruna po swapie | większość tur zaczyna się tym samym optymalnym ruchem |
| Pułapki okazują się mało użyteczne | konkretne trasy podejścia, wymuszone wejście, podgląd rootów | gracze świadomie pomijają sidła mimo okazji |
| Wygrywa zawsze eliminacja przez otchłań | różne mapy, brak otchłani na części plansz, cele obrony | wszyscy grają wyłącznie kombinacją swap + push |
| Rozjazd podglądu i rozgrywki | jeden symulator i testy całych faz | dowolna niezgodność to blocker wydania |
| Przeładowany interfejs | progressive disclosure, wyraźny wybór i tekst konsekwencji | gracz nie rozumie, dlaczego cel jest legalny lub nie |
| Zbyt duży koszt oprawy | placeholdery do końca etapu taktyki, ograniczony budżet efektów | assety blokują testy podstawowych decyzji |
| Powrót błędu pustej strony na Pages | test artefaktu pod podścieżką, publikacja dist, jawny bootstrap | jakiekolwiek 404 głównego modułu lub brak panelu błędu |

Zmiany wartości balansowych należy zapisywać wraz z hipotezą i wynikiem playtestu. Nie dodajemy nowych klas, większej planszy ani kolejnej waluty, zanim sześć podstawowych zdolności nie będzie czytelnych i przydatnych.
