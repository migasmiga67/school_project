export type ConnectionPhase = 'signaling' | 'rtc' | 'admission';

// Each timer starts when its own operation starts. In particular, time spent
// gathering ICE candidates must not consume the application hello deadline.
export const CONNECTION_TIMEOUT_MS = { signaling: 10000, rtc: 30000, admission: 7000 } as const;
export const CONNECTION_PROGRESS: Record<ConnectionPhase, string> = {
  signaling: 'Łączenie z serwerem pokojów…',
  rtc: 'Szukanie połączenia z gospodarzem przez sieć…',
  admission: 'Połączenie nawiązane. Dołączanie do pokoju…',
};
export const CONNECTION_TIMEOUT_MESSAGE: Record<ConnectionPhase, string> = {
  signaling: 'Serwer pokojów nie odpowiada. Sprawdź internet i spróbuj ponownie.',
  rtc: 'Nie udało się zestawić połączenia z gospodarzem. Sieć może blokować połączenia między graczami lub serwer przekazujący jest niedostępny. Spróbuj ponownie.',
  admission: 'Połączenie z gospodarzem działa, ale pokój nie potwierdził dołączenia. Odśwież grę u obu osób i utwórz nowy pokój.',
};
export const SIGNALING_UNAVAILABLE_MESSAGE = 'Trwa przywracanie połączenia z serwerem pokojów. Obecna ekipa może grać dalej; nowe osoby dołączą po przywróceniu połączenia.';
