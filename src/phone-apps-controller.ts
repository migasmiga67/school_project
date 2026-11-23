import './phone-apps.css';
import type { GameState, Point, Vehicle } from './model';
import { getCityEnvironment } from './city-life';
import { addItem, ITEMS, type Inventory, type ItemId } from './inventory';
import type { GarageState, GarageUpgrade } from './garage';
import { districtAt } from './world-layout';
import {
  PHONE_APPS, PROPERTIES, FOOD_MENU, FOOD_DELIVERY_FEE, KITCHENS, DEPOTS, TOW_PRICE, TOW_FUEL, TOW_HEALTH, RADIO_STATIONS, MARKET_WINDOW, SELL_RATE,
  scannerUnits, scannerChatter, scannerAlert, upcomingRace, raceDefinitions, rivalTimes, signUpForRace, stepRace, raceTarget,
  dispatchCourier, stepCourier, pathLength, foodPrice, towNeeded, accrueRent, buyProperty, sellProperty, collectRent, estateIncomePerDay,
  parseEstate, forecast, nextWeatherChange, marketOffers, marketWindow, marketBusted, parseMarket,
  type PhoneAppId, type RaceEntry, type Courier, type EstateState, type MarketState, type RadioStationId, type ScannerUnit,
} from './phone-apps';
import { CarRadio } from './radio';
import { PhoneAppsView } from './phone-apps-view';

export interface PhoneAppsContext {
  getState(): GameState; worldSeconds(): number; online(): boolean; indoors(): boolean;
  spend(amount: number): void; earn(amount: number): void;
  getInventory(): Inventory; getGarage(): GarageState; installUpgrade(upgrade: GarageUpgrade): boolean;
  ownCar(): Vehicle | undefined; care(): { fuel: number; wear: number }; tank: number;
  notify(text: string): void; persist(): void; route(point: Point, label: string): void; sound(kind: 'reward' | 'damage' | 'info'): void;
}
/** What the phone shell needs to show these apps. */
export interface PhoneAppsHost {
  readonly apps: readonly { id: string; name: string; icon: string }[];
  render(id: string): string; bind(id: string, root: HTMLElement, report: (text: string) => void, close: () => void): void; signature(id: string): string;
}
const safe = (value: string) => value.replace(/[&<>"']/g, item => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[item]!));
const money = (value: number) => `$${Math.max(0, Math.round(value)).toLocaleString('pl-PL')}`;
const metres = (value: number) => value >= 1000 ? `${(value / 1000).toFixed(1).replace('.', ',')} km` : `${Math.round(value)} m`;
const seconds = (value: number) => value >= 60 ? `${Math.floor(value / 60)} min ${String(Math.floor(value % 60)).padStart(2, '0')} s` : `${Math.max(0, Math.ceil(value))} s`;
const UNIT_LABEL: Record<ScannerUnit['kind'], [string, string]> = { patrol: ['🚓', 'Patrol'], pursuit: ['🚨', 'Pościg'], helicopter: ['🚁', 'Śmigłowiec'], roadblock: ['⛔', 'Blokada'] };
const SOLO_ONLY = 'W grze online portfel prowadzi gospodarz pokoju — ta funkcja działa w trybie solo.';

export class PhoneApps implements PhoneAppsHost {
  readonly apps = PHONE_APPS;
  readonly view = new PhoneAppsView();
  readonly radio = new CarRadio();
  estate: EstateState;
  market: MarketState;
  scannerOnMap: boolean;
  race: RaceEntry | null = null;
  food: { courier: Courier; item: ItemId } | null = null;
  tow: Courier | null = null;
  private log: { at: string; text: string; alert: boolean }[] = [];
  private lastWorld = NaN;
  private chatterSlot = -1;
  private lastRaceResult = '';
  private reminded = -1;
  private before = { wanted: 0, status: 'clear', heli: false, blocks: 0 };

  constructor(private readonly ctx: PhoneAppsContext, saved?: unknown) {
    const raw = (saved && typeof saved === 'object' ? saved : {}) as Record<string, unknown>;
    this.estate = parseEstate(raw.estate); this.market = parseMarket(raw.market); this.scannerOnMap = raw.scannerOnMap !== false;
    const station = RADIO_STATIONS.find(item => item.id === raw.radio)?.id ?? null;
    this.radio.station = station;
  }
  get saved() { return { estate: this.estate, market: this.market, scannerOnMap: this.scannerOnMap, radio: this.radio.station }; }
  /** Where the GPS should lead: race checkpoints win over everything else while racing. */
  get target(): Point | null { return raceTarget(this.race); }
  get racing() { return this.race?.status === 'running'; }
  get helpers() { return [...(this.food ? [{ point: this.food.courier.position, icon: 'J' }] : []), ...(this.tow ? [{ point: this.tow.position, icon: 'M' }] : [])]; }
  get scannerUnits() { return this.scannerOnMap ? scannerUnits(this.ctx.getState()) : []; }

  step(dt: number, active: boolean) {
    const state = this.ctx.getState(), now = this.ctx.worldSeconds();
    const worldDt = Number.isFinite(this.lastWorld) ? Math.max(0, Math.min(5, now - this.lastWorld)) : 0;this.lastWorld = now;
    const audible = active && state.player.mode === 'drive' && !state.interior;
    this.radio.update(audible);
    this.radioChip(audible ? RADIO_STATIONS.find(item => item.id === this.radio.station)?.name ?? null : null);
    this.view.update(this.food?.courier ?? null, this.tow, now);
    if (!active) return;
    if (!this.ctx.online()) accrueRent(this.estate, worldDt);
    // Scanner: dispatcher alerts on chase changes, routine chatter otherwise.
    const alert = scannerAlert(this.before, state);
    if (alert) { this.push(alert, true); if (this.scannerOnMap) this.ctx.notify(`📡 ${alert}`); }
    this.before = { wanted: state.wanted, status: state.pursuit?.status ?? 'clear', heli: Boolean(state.pursuit?.helicopter), blocks: state.pursuit?.roadblocks.length ?? 0 };
    const slot = Math.floor(now / 40);
    if (slot !== this.chatterSlot) { this.chatterSlot = slot; if (now > 5) this.push(scannerChatter(state, now), false); }
    if (marketWindow(now) !== this.market.window) this.market = { window: marketWindow(now), bought: [] };
    this.stepRace(state, now);
    this.stepFood(state, dt);
    this.stepTow(dt);
  }
  private chip: HTMLElement | null = null;
  private radioChip(name: string | null) {
    if (typeof document === 'undefined') return;
    if (!this.chip) { this.chip = document.createElement('div'); this.chip.id = 'radio-chip'; this.chip.className = 'radio-chip hidden'; this.chip.setAttribute('aria-hidden', 'true'); document.body.append(this.chip); }
    const text = name ? `📻 ${name}` : '';
    if (this.chip.textContent !== text) this.chip.textContent = text;
    this.chip.classList.toggle('hidden', !name);
  }
  private push(text: string, alert: boolean) {
    this.log.unshift({ at: getCityEnvironment(this.ctx.worldSeconds()).clock, text, alert });
    this.log = this.log.slice(0, 14);
  }
  private stepRace(state: GameState, now: number) {
    const entry = this.race;
    if (!entry || entry.status === 'finished') return;
    if (entry.status === 'signed' && entry.startedAt - now < 45 && this.reminded !== entry.index) {
      this.reminded = entry.index;
      this.ctx.notify(`🏁 Wyścig startuje za ${Math.ceil(entry.startedAt - now)} s. Ustaw się autem na linii startu (GPS).`);
    }
    const event = stepRace(entry, state.player, state.player.mode === 'drive', now);
    if (!event) return;
    this.ctx.notify(`🏁 ${event.text}`);
    if (event.kind === 'finish' || event.kind === 'missed' || event.kind === 'dnf') {
      this.lastRaceResult = event.text;
      if (event.payout) { this.ctx.earn(event.payout); this.ctx.sound('reward'); }
      this.race = null; this.ctx.persist();
    } else this.ctx.sound('info');
  }
  private stepFood(state: GameState, dt: number) {
    if (!this.food || this.ctx.indoors() || state.player.mode !== 'foot') return;
    if (!stepCourier(this.food.courier, state.player, dt, 2.6)) return;
    const item = this.food.item, problem = addItem(this.ctx.getInventory(), item);
    if (problem) { this.ctx.earn(foodPrice(item)); this.ctx.notify(`Kurier: ${problem} Zwracam pieniądze.`); }
    else { this.ctx.notify(`Kurier: smacznego! ${ITEMS[item].name} jest w plecaku — użyj w ekwipunku (I).`); this.ctx.sound('reward'); }
    this.food = null; this.ctx.persist();
  }
  private stepTow(dt: number) {
    if (!this.tow) return;
    const car = this.ctx.ownCar();
    if (!car) { this.tow = null; return; }
    if (!stepCourier(this.tow, car, dt, 6)) return;
    const care = this.ctx.care();
    care.fuel = Math.min(this.ctx.tank, Math.max(care.fuel, care.fuel + TOW_FUEL));
    car.health = Math.max(car.health, TOW_HEALTH); care.wear = Math.min(care.wear, .45);
    this.ctx.notify(`🛻 Mechanik: dolałem ${TOW_FUEL} L paliwa, poprawiłem auto do ${TOW_HEALTH}% i przejrzałem silnik. Szerokiej drogi!`);
    this.ctx.sound('reward'); this.tow = null; this.ctx.persist();
  }

  signature(id: string) {
    const now = this.ctx.worldSeconds(), state = this.ctx.getState();
    const coarse = Math.floor(now);
    switch (id as PhoneAppId) {
      case 'scanner': return JSON.stringify([this.scannerOnMap, this.log.length && this.log[0].text, state.wanted, scannerUnits(state).map(u => [u.kind, Math.round(u.distance / 10)])]);
      case 'races': return JSON.stringify([coarse, this.race, this.lastRaceResult, state.money]);
      case 'food': return JSON.stringify([this.food && Math.round(this.food.courier.segment), this.food?.item, Math.floor(coarse / 2), state.money]);
      case 'estate': return JSON.stringify([this.estate.owned, Math.floor(this.estate.pending), state.money]);
      case 'tow': return JSON.stringify([Boolean(this.tow), this.tow && this.tow.segment, Math.floor(coarse / 2), Math.round(this.ctx.care().fuel), Math.round(this.ctx.ownCar()?.health ?? 0), state.money]);
      case 'weather': return JSON.stringify([Math.floor(now / 30), this.radio.station]);
      case 'market': return JSON.stringify([this.market, coarse, state.money]);
    }
    return '';
  }

  render(id: string): string {
    switch (id as PhoneAppId) {
      case 'scanner': return this.renderScanner();
      case 'races': return this.renderRaces();
      case 'food': return this.renderFood();
      case 'estate': return this.renderEstate();
      case 'tow': return this.renderTow();
      case 'weather': return this.renderWeather();
      case 'market': return this.renderMarket();
    }
    return '';
  }

  private renderScanner() {
    const state = this.ctx.getState(), units = scannerUnits(state);
    const status = state.wanted ? `<b class="pa-alert">POSZUKIWANY · ${'★'.repeat(state.wanted)}</b>` : '<b class="pa-ok">Czysto — nikt cię nie szuka</b>';
    return `<section class="pa-card pa-scanner"><small>CZĘSTOTLIWOŚĆ POLICJI · 154,250 MHz</small><p>${status}</p><label class="pa-toggle"><input type="checkbox" id="pa-scanner-map" ${this.scannerOnMap ? 'checked' : ''}/> Pokazuj radiowozy, blokady i śmigłowiec na minimapie</label></section>
<h3 class="pa-h">Jednostki w mieście (${units.length})</h3><ul class="pa-list">${units.length ? units.slice(0, 8).map(unit => `<li><span>${UNIT_LABEL[unit.kind][0]}</span><div><strong>${UNIT_LABEL[unit.kind][1]}</strong><small>${safe(unit.district)}</small></div><em>${metres(unit.distance)}</em></li>`).join('') : '<li class="pa-empty">Brak jednostek w zasięgu.</li>'}</ul>
<h3 class="pa-h">Nasłuch</h3><ol class="pa-log" aria-live="polite">${this.log.length ? this.log.map(line => `<li class="${line.alert ? 'pa-alert' : ''}"><time>${line.at}</time>${safe(line.text)}</li>`).join('') : '<li>Szum… czekam na komunikaty dyspozytora.</li>'}</ol>`;
  }

  private renderRaces() {
    const now = this.ctx.worldSeconds(), next = upcomingRace(now), entry = this.race, online = this.ctx.online();
    const raceOf = (index: number) => raceDefinitions()[index % raceDefinitions().length];
    const shown = entry ? raceOf(entry.index) : next.race, startAt = entry && entry.status === 'signed' ? entry.startedAt : next.startAt;
    const pool = shown.entry * (shown.rivals.length + 1);
    let state = '';
    if (entry?.status === 'running') {
      const elapsed = now - entry.startedAt;
      state = `<div class="pa-live"><strong>JEDZIESZ!</strong><span>Punkt ${entry.next}/${shown.checkpoints.length - 1}</span><span>${elapsed.toFixed(1)} s</span></div><p class="pa-note">Złoty znacznik i GPS prowadzą do kolejnego punktu. Musisz przejechać każdy punkt autem.</p>`;
    } else if (entry?.status === 'signed') {
      state = `<div class="pa-live"><strong>ZAPISANY</strong><span>Start za ${seconds(entry.startedAt - now)}</span></div><p class="pa-note">Bądź autem w promieniu 30 m od linii startu w chwili startu. Spóźnienie = utrata wpisowego.</p><button class="phone-secondary" id="pa-race-gps">GPS na linię startu →</button>`;
    } else {
      state = `<button class="phone-primary" id="pa-race-sign" ${online || this.ctx.getState().money < shown.entry ? 'disabled' : ''}>Zapisz się · wpisowe ${money(shown.entry)}</button>${online ? `<p class="pa-note">${SOLO_ONLY}</p>` : ''}`;
    }
    const rivals = rivalTimes(shown, entry?.index ?? next.index).sort((a, b) => a.time - b.time);
    return `<section class="pa-card pa-race"><small>NIELEGALNE WYŚCIGI · ${getCityEnvironment(startAt).clock}</small><h2>${safe(shown.name)}</h2><div class="pa-stats"><span><b>${metres(shown.length)}</b>trasa</span><span><b>${shown.checkpoints.length - 1}</b>punktów</span><span><b>${money(pool)}</b>pula</span></div><p>Start: ${safe(districtAt(shown.checkpoints[0]))} · za ${seconds(startAt - now)}</p>${state}</section>
<h3 class="pa-h">Rywale (najlepsze czasy na tej trasie)</h3><ul class="pa-list">${rivals.map(rival => `<li><span>🏎</span><div><strong>${safe(rival.name)}</strong><small>Szacowany czas</small></div><em>${rival.time.toFixed(0)} s</em></li>`).join('')}</ul>
${this.lastRaceResult ? `<p class="pa-note pa-result">Ostatni wynik: ${safe(this.lastRaceResult)}</p>` : ''}<p class="pa-note">Wyścig co 8 godzin w grze (4 minuty). Zwycięzca bierze całą pulę wpisowych.</p>`;
  }

  private renderFood() {
    const order = this.food, wallet = this.ctx.getState().money;
    const status = order ? (() => { const left = pathLength([order.courier.position, ...order.courier.path.slice(order.courier.segment)]); return `<section class="pa-card"><small>ZAMÓWIENIE W DRODZE</small><h2>${ITEMS[order.item].icon} ${ITEMS[order.item].name}</h2><p>Kurier na skuterze jest ${metres(left)} od ciebie · ok. ${seconds(left / order.courier.speed)}</p><p class="pa-note">Zostań na zewnątrz, pieszo — kurier podjedzie prosto do ciebie.</p></section>`; })() : '';
    return `${status}<p class="phone-copy">Burger Coast Delivery · dostawa ${money(FOOD_DELIVERY_FEE)}. Jedzenie trafia do plecaka (I), a zjedzone daje zdrowie albo szybszy sprint.</p><ul class="pa-list pa-menu">${FOOD_MENU.map(entry => `<li><span>${ITEMS[entry.item].icon}</span><div><strong>${ITEMS[entry.item].name}</strong><small>${safe(ITEMS[entry.item].description)}</small></div><button id="pa-food-${entry.item}" ${order || wallet < foodPrice(entry.item) ? 'disabled' : ''}>${money(foodPrice(entry.item))}</button></li>`).join('')}</ul>`;
  }

  private renderEstate() {
    const online = this.ctx.online(), wallet = this.ctx.getState().money, perDay = estateIncomePerDay(this.estate);
    return `<section class="pa-card"><small>TWOJE NIERUCHOMOŚCI</small><div class="pa-stats"><span><b>${this.estate.owned.length}</b>lokali</span><span><b>${money(perDay)}</b>na dobę</span><span><b>${money(this.estate.pending)}</b>do odbioru</span></div><button class="phone-primary" id="pa-estate-collect" ${online || this.estate.pending < 1 ? 'disabled' : ''}>Odbierz czynsz · ${money(Math.floor(this.estate.pending))}</button><p class="pa-note">${online ? SOLO_ONLY : 'Doba w grze trwa 12 minut. Niezebrany czynsz czeka maksymalnie 3 doby.'}</p></section>
<ul class="pa-list pa-estate">${PROPERTIES.map(property => { const owned = this.estate.owned.includes(property.id); return `<li class="${owned ? 'pa-owned' : ''}"><span>${property.kind === 'Garaż' ? '🅿' : property.kind === 'Apartament' ? '🏙' : property.kind === 'Lokal użytkowy' ? '🏢' : '🏠'}</span><div><strong>${safe(property.name)}</strong><small>${safe(property.kind)} · czynsz ${money(property.rentPerDay)}/dobę${owned ? ' · TWOJE' : ''}</small></div><div class="pa-actions"><button id="pa-estate-route-${property.id}" aria-label="Pokaż ${safe(property.name)} na GPS">⌖</button>${owned ? `<button id="pa-estate-sell-${property.id}" ${online ? 'disabled' : ''}>Sprzedaj ${money(property.price * SELL_RATE)}</button>` : `<button id="pa-estate-buy-${property.id}" ${online || wallet < property.price ? 'disabled' : ''}>Kup ${money(property.price)}</button>`}</div></li>`; }).join('')}</ul>`;
  }

  private renderTow() {
    const car = this.ctx.ownCar(), care = this.ctx.care(), wallet = this.ctx.getState().money;
    const problem = this.tow ? null : towNeeded(car ?? null, care.fuel, care.wear);
    const eta = this.tow ? pathLength([this.tow.position, ...this.tow.path.slice(this.tow.segment)]) : 0;
    return `<section class="pa-card pa-tow"><small>POMOC DROGOWA 24/7</small><h2>Twój Stratus</h2><div class="pa-stats"><span><b>${care.fuel.toFixed(1).replace('.', ',')} L</b>paliwo</span><span><b>${Math.round(car?.health ?? 0)}%</b>stan auta</span><span><b>${Math.round((1 - care.wear) * 100)}%</b>silnik</span></div>${car ? `<p>Auto stoi: ${safe(districtAt(car))}, ${metres(Math.hypot(car.x - this.ctx.getState().player.x, car.z - this.ctx.getState().player.z))} od ciebie.</p>` : ''}
${this.tow ? `<div class="pa-live"><strong>LAWETA W DRODZE</strong><span>${metres(eta)}</span><span>ok. ${seconds(eta / this.tow.speed)}</span></div>` : `<button class="phone-primary" id="pa-tow-call" ${problem || wallet < TOW_PRICE ? 'disabled' : ''}>Wezwij mechanika · ${money(TOW_PRICE)}</button>`}${problem ? `<p class="pa-note">${safe(problem)}</p>` : ''}</section><p class="phone-copy">Mechanik przyjeżdża lawetą prosto do twojego auta: dolewa ${TOW_FUEL} L paliwa, naprawia karoserię do ${TOW_HEALTH}% i doraźnie łata silnik. Pełny remont zrobisz w MOD SHOP.</p>`;
  }

  private renderWeather() {
    const now = this.ctx.worldSeconds(), env = getCityEnvironment(now), hours = forecast(now, 8), change = nextWeatherChange(now);
    const icon = (rain: boolean, period: string) => rain ? '🌧' : period === 'NOC' ? '🌙' : period === 'DZIEŃ' ? '☀' : '🌅';
    return `<section class="pa-card pa-weather"><small>NEON COAST · ${env.clock}</small><div class="pa-weather-now"><span>${icon(env.rain > .01, env.period)}</span><div><b>${hours[0].temp}°C</b><p>${env.weather === 'DESZCZ' ? 'Deszcz — mokra jezdnia, dłuższa droga hamowania' : 'Bezchmurnie'} · ${env.period.toLowerCase()}</p></div></div><p class="pa-note">${change.rain ? 'Deszcz zacznie padać' : 'Przestanie padać'} za ok. ${seconds(change.inSeconds)} (${Math.round(change.inSeconds / 30 * 60)} min w grze).</p><ol class="pa-forecast">${hours.map(hour => `<li><small>${hour.clock}</small><span>${icon(hour.rain, hour.period)}</span><b>${hour.temp}°</b></li>`).join('')}</ol></section>
<h3 class="pa-h">Radio w aucie</h3><ul class="pa-list pa-radio">${RADIO_STATIONS.map(station => `<li class="${this.radio.station === station.id ? 'pa-owned' : ''}"><span>📻</span><div><strong>${station.name}</strong><small>${station.genre}</small></div><button id="pa-radio-${station.id}" aria-pressed="${this.radio.station === station.id}">${this.radio.station === station.id ? '♫ Gra' : '▶ Słuchaj'}</button></li>`).join('')}<li><span>⏻</span><div><strong>Radio wyłączone</strong><small>Cisza w kabinie</small></div><button id="pa-radio-off" ${this.radio.station ? '' : 'disabled'}>Wyłącz</button></li></ul><p class="pa-note">Muzyka gra, gdy prowadzisz auto. Wszystkie utwory są generowane na żywo przez grę.</p>`;
  }

  private renderMarket() {
    const now = this.ctx.worldSeconds(), offers = marketOffers(marketWindow(now), this.ctx.getGarage()), wallet = this.ctx.getState().money, online = this.ctx.online();
    const left = MARKET_WINDOW - (now % MARKET_WINDOW);
    return `<section class="pa-card pa-market"><small>ZASZYFROWANY KANAŁ</small><h2>Towar na dziś</h2><p>Nowa dostawa za ${seconds(left)}. Każdy deal to ryzyko, że gliny patrzą.</p></section><ul class="pa-list pa-offers">${offers.map(offer => { const bought = this.market.bought.includes(offer.id), blocked = Boolean(offer.upgrade && online); return `<li class="${bought ? 'pa-owned' : ''}"><span>${offer.upgrade ? '⚙' : ITEMS[offer.item!].icon}</span><div><strong>${safe(offer.title)}</strong><small>${safe(offer.detail)}</small><small><s>${money(offer.normal)}</s> · ryzyko wpadki ${Math.round(offer.risk * 100)}%</small></div><button id="pa-market-${offer.id}" ${bought || blocked || wallet < offer.price ? 'disabled' : ''}>${bought ? 'Kupione' : money(offer.price)}</button></li>`; }).join('')}</ul><p class="pa-note">${online ? 'Tuning z czarnego rynku działa tylko w grze solo (garaż online prowadzi gospodarz).' : 'Tuning montowany jest od razu w aucie wybranym w garażu.'}</p>`;
  }

  bind(id: string, root: HTMLElement, report: (text: string) => void, close: () => void) {
    const on = (selector: string, callback: () => void) => root.querySelector<HTMLElement>(selector)?.addEventListener('click', callback);
    const state = this.ctx.getState();
    if (id === 'scanner') root.querySelector<HTMLInputElement>('#pa-scanner-map')?.addEventListener('change', event => { this.scannerOnMap = (event.target as HTMLInputElement).checked; this.ctx.persist(); report(this.scannerOnMap ? 'Skaner: radiowozy widoczne na minimapie.' : 'Skaner: tylko nasłuch.'); });
    if (id === 'races') {
      on('#pa-race-sign', () => {
        if (this.ctx.online()) { report(SOLO_ONLY); return; }
        const result = signUpForRace(this.race, state.money, this.ctx.worldSeconds());
        if (!result.ok) { report(result.message); return; }
        this.ctx.spend(result.cost); this.race = result.entry; this.lastRaceResult = ''; report(result.message); this.ctx.persist();
      });
      on('#pa-race-gps', () => { const target = raceTarget(this.race); if (target) { close(); this.ctx.route(target, 'Linia startu wyścigu'); } });
    }
    if (id === 'food') for (const entry of FOOD_MENU) on(`#pa-food-${entry.item}`, () => {
      if (this.food) { report('Masz już zamówienie w drodze.'); return; }
      if (this.ctx.indoors() || state.player.mode !== 'foot') { report('Wyjdź pieszo na zewnątrz — kurier musi do ciebie dojechać.'); return; }
      const price = foodPrice(entry.item);
      if (state.money < price) { report(`Zamówienie kosztuje ${money(price)}.`); return; }
      this.ctx.spend(price); this.food = { item: entry.item, courier: dispatchCourier(KITCHENS, state.player, 9.5, 70) };
      report(`Zamówiono: ${ITEMS[entry.item].name}. Kurier już jedzie!`);
    });
    if (id === 'estate') {
      on('#pa-estate-collect', () => { if (this.ctx.online()) { report(SOLO_ONLY); return; } const amount = collectRent(this.estate); if (amount > 0) { this.ctx.earn(amount); this.ctx.sound('reward'); report(`Najemcy zapłacili: +${money(amount)}.`); this.ctx.persist(); } });
      for (const property of PROPERTIES) {
        on(`#pa-estate-route-${property.id}`, () => { close(); this.ctx.route(property.point, property.name); });
        on(`#pa-estate-buy-${property.id}`, () => { if (this.ctx.online()) { report(SOLO_ONLY); return; } const result = buyProperty(this.estate, state.money, property.id); if (result.ok) { this.ctx.spend(result.cost); this.ctx.persist(); } report(result.message); });
        on(`#pa-estate-sell-${property.id}`, () => { if (this.ctx.online()) { report(SOLO_ONLY); return; } const result = sellProperty(this.estate, property.id); if (result.ok) { this.ctx.earn(result.refund); this.ctx.persist(); } report(result.message); });
      }
    }
    if (id === 'tow') on('#pa-tow-call', () => {
      const car = this.ctx.ownCar(), care = this.ctx.care(), problem = towNeeded(car ?? null, care.fuel, care.wear);
      if (problem || !car) { report(problem ?? 'Brak auta.'); return; }
      if (this.tow) { report('Laweta jest już w drodze.'); return; }
      if (state.money < TOW_PRICE) { report(`Mechanik kosztuje ${money(TOW_PRICE)}.`); return; }
      this.ctx.spend(TOW_PRICE); this.tow = dispatchCourier(DEPOTS, car, 12, 80); report('Mechanik przyjął zgłoszenie — laweta jedzie do twojego auta.');
    });
    if (id === 'weather') {
      for (const station of RADIO_STATIONS) on(`#pa-radio-${station.id}`, () => { this.radio.tune(station.id as RadioStationId); this.ctx.persist(); report(`📻 ${station.name} — ${station.genre}. ${state.player.mode === 'drive' ? 'Gra!' : 'Zagra, gdy wsiądziesz do auta.'}`); });
      on('#pa-radio-off', () => { this.radio.tune(null); this.ctx.persist(); report('Radio wyłączone.'); });
    }
    if (id === 'market') for (const offer of marketOffers(marketWindow(this.ctx.worldSeconds()), this.ctx.getGarage())) on(`#pa-market-${offer.id}`, () => {
      if (this.market.bought.includes(offer.id)) { report('Ten towar już zszedł.'); return; }
      if (state.money < offer.price) { report(`To kosztuje ${money(offer.price)}.`); return; }
      if (offer.upgrade) {
        if (this.ctx.online()) { report(SOLO_ONLY); return; }
        if (!this.ctx.installUpgrade(offer.upgrade)) { report('Tego nie da się zamontować w tym aucie.'); return; }
      } else {
        const inventory = this.ctx.getInventory(), copy = structuredClone(inventory);
        for (let k = 0; k < (offer.count ?? 1); k++) { const problem = addItem(copy, offer.item!); if (problem) { report(problem); return; } }
        inventory.slots = copy.slots;
      }
      this.ctx.spend(offer.price); this.market.bought.push(offer.id);
      if (marketBusted(offer)) {
        state.wanted = Math.max(state.wanted, 1); state.heat = Math.max(state.heat, 45);
        report('Wpadka! Tajniak widział transakcję — policja cię szuka.'); this.ctx.sound('damage');
      } else report(`Deal zrobiony: ${offer.title}. Nikt nic nie widział.`);
      this.ctx.persist();
    });
  }
}
