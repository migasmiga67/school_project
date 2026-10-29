import './garage.css';
import { GARAGE_CARS, GARAGE_PAINTS, GARAGE_PAINT_PRICE, GARAGE_UPGRADE_NAMES, GARAGE_MAX_LEVEL, GARAGE_ELITE_REPUTATION, garageUpgradePrice, parseGarage, type GarageAction, type GarageState, type GarageUpgrade } from './garage';

export interface GarageCallbacks {
  getGarage: () => GarageState;
  getWallet: () => number;
  onAction: (action: GarageAction) => void;
  onOpen: () => void;
  onClose: () => void;
  onMessage: (text: string) => void;
  isOnline?: () => boolean;
  getReputation?: () => number;
}
const money = (value: number) => `$${Math.max(0, value).toLocaleString('pl-PL')}`;
const hex = (color: number) => `#${color.toString(16).padStart(6, '0')}`;
const safe = (value: string) => value.replace(/[&<>"']/g, item => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[item]!));
const upgradeDescriptions: Record<GarageUpgrade, string> = {
  engine: 'Lepsze przyspieszenie i większa prędkość maksymalna.',
  brakes: 'Mocniejsze hamowanie i skuteczniejszy hamulec ręczny.',
  nitro: 'Więcej mocy i wyższa prędkość podczas trzymania Shift.',
};

/** Garage presentation reads the current solo profile or authoritative room snapshot. */
export class GarageUI {
  private root: HTMLDivElement | null = null;
  private visible = false;
  private pending = false;
  private message = '';
  private signature = '';
  private wait: ReturnType<typeof setTimeout> | null = null;
  private previousFocus: HTMLElement | null = null;
  constructor(private parent: HTMLElement, private callbacks: GarageCallbacks) {}
  get active() { return this.visible; }
  open() {
    if (this.visible) return;
    this.visible = true; this.pending = false; this.message = ''; this.signature = '';
    this.previousFocus = document.activeElement as HTMLElement;
    this.root = document.createElement('div'); this.root.id = 'garage-root'; this.root.className = 'garage-overlay';
    this.root.setAttribute('role', 'dialog'); this.root.setAttribute('aria-modal', 'true'); this.root.setAttribute('aria-labelledby', 'garage-heading');
    this.root.addEventListener('keydown', event => {
      event.stopPropagation();
      if (event.key === 'Escape') { event.preventDefault(); this.close(); }
      else if (event.key === 'Tab') this.trapFocus(event);
    });
    this.parent.append(this.root); this.callbacks.onOpen(); this.refresh(); this.query('#garage-close')?.focus({ preventScroll: true });
  }
  close() {
    if (!this.visible) return;
    this.visible = false; this.pending = false; this.clearWait(); this.root?.remove(); this.root = null;
    this.callbacks.onClose();
    if (this.previousFocus?.isConnected && this.previousFocus.getClientRects().length) this.previousFocus.focus({ preventScroll: true });
    this.previousFocus = null;
  }
  handleEscape() { this.close(); }
  destroy() { this.close(); this.clearWait(); }
  /** Supply a rejection/notice to acknowledge an unchanged authority snapshot. */
  refresh(message?: string) {
    if (!this.visible) return;
    const signature = JSON.stringify([this.callbacks.getGarage(), this.callbacks.getWallet(), this.callbacks.isOnline?.() ?? false, this.callbacks.getReputation?.() ?? 0]);
    if (signature === this.signature && !message) return;
    this.signature = signature; this.pending = false; this.clearWait();
    if (message) this.message = message;
    this.render();
  }
  report(message: string) { this.refresh(message); }
  private clearWait() { if (this.wait !== null) { clearTimeout(this.wait); this.wait = null; } }
  private query<T extends HTMLElement = HTMLElement>(selector: string) { return this.root?.querySelector<T>(selector) ?? null; }
  private trapFocus(event: KeyboardEvent) {
    const controls = [...(this.root?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])];
    const first = controls[0], last = controls.at(-1);
    if (!first) { event.preventDefault(); return; }
    if (!controls.includes(document.activeElement as HTMLButtonElement)) { (event.shiftKey ? last : first)?.focus(); event.preventDefault(); }
    else if (event.shiftKey && document.activeElement === first) { last?.focus(); event.preventDefault(); }
    else if (!event.shiftKey && document.activeElement === last) { first.focus(); event.preventDefault(); }
  }
  private request(action: GarageAction) {
    if (this.pending || !this.visible) return;
    this.pending = true; this.message = ''; this.render();
    this.clearWait(); this.wait = setTimeout(() => {
      this.wait = null;
      if (!this.visible) return;
      this.pending = false; this.message = 'Brak potwierdzenia warsztatu. Sprawdź połączenie i spróbuj ponownie.'; this.render();
    }, 8000);
    try { this.callbacks.onAction(action); }
    catch (error) { this.report(error instanceof Error ? error.message : 'Nie udało się wykonać zlecenia.'); }
  }
  private render() {
    if (!this.root || !this.visible) return;
    const focusId = this.root.contains(document.activeElement) ? (document.activeElement as HTMLElement).id : '';
    const garage = parseGarage(this.callbacks.getGarage()), wallet = this.callbacks.getWallet(), settings = garage.cars[garage.selected]!;
    const rawReputation = this.callbacks.getReputation?.() ?? 0;
    const reputation = Number.isSafeInteger(rawReputation) && rawReputation >= 0 ? rawReputation : 0;
    const model = GARAGE_CARS[garage.selected];
    this.root.innerHTML = `<section class="garage-shell"><header class="garage-header"><div><span class="garage-eyebrow">NEON COAST · MOD SHOP</span><h1 id="garage-heading">Twój garaż.</h1><p>Wybierz auto, nadaj mu kolor i przygotuj je na noc.</p></div><div class="garage-header-actions"><span class="garage-wallet"><small>${this.callbacks.isOnline?.() ? 'PORTFEL ONLINE' : 'TWÓJ PORTFEL'}</small><strong id="garage-wallet">${money(wallet)}</strong></span><button id="garage-close" class="garage-button garage-button--quiet" aria-label="Zamknij garaż">Wróć na ulicę ×</button></div></header>
    <div class="garage-content"><section class="garage-catalog" aria-label="Samochody w garażu">${Object.values(GARAGE_CARS).map(car => {
      const owned = garage.owned.includes(car.id), selected = garage.selected === car.id, color = garage.cars[car.id]?.paint ?? car.paint;
      return `<article class="garage-car ${selected ? 'garage-car--selected' : ''}" data-car="${car.id}"><div class="garage-car-art garage-car-art--${car.kind}" style="--car-paint:${hex(color)}" role="img" aria-label="${car.name}"><i></i><b></b></div><span class="garage-car-tag">${selected ? 'NA ULICY' : owned ? 'W GARAŻU' : 'SALON'}</span><h2>${car.name}</h2><p>${car.description}</p><button id="garage-${owned ? 'select' : 'buy'}-${car.id}" class="garage-button ${selected ? 'garage-button--selected' : ''}" ${this.pending || selected || (!owned && wallet < car.price) ? 'disabled' : ''}>${selected ? 'Wybrany' : owned ? 'Wybierz samochód' : `Kup i wybierz · ${money(car.price)}`}</button></article>`;
    }).join('')}</section>
    <section class="garage-workshop" aria-labelledby="garage-workshop-heading"><div class="garage-workshop-title"><span class="garage-eyebrow">WYBRANY SAMOCHÓD</span><h2 id="garage-workshop-heading">${model.name}</h2><p>${this.callbacks.isOnline?.() ? 'Garaż i gotówka online dotyczą tego pokoju. Zakupy nie zmieniają twojego garażu solo.' : 'Zmiany dotyczą tego modelu. Samochody i tuning zapisują się w tej przeglądarce.'}</p></div>
    <section class="garage-paint" aria-label="Lakierowanie"><div><h3>Nowy lakier</h3><span>${money(GARAGE_PAINT_PRICE)}</span></div><div class="garage-swatches">${GARAGE_PAINTS.map(item => `<button id="garage-paint-${item.color.toString(16)}" class="garage-swatch ${settings.paint === item.color ? 'garage-swatch--selected' : ''}" style="--paint:${hex(item.color)}" aria-label="Lakier ${item.name} za $80" aria-pressed="${settings.paint === item.color}" title="${item.name}" ${this.pending || settings.paint === item.color || wallet < GARAGE_PAINT_PRICE ? 'disabled' : ''}><span>${settings.paint === item.color ? '✓' : ''}</span></button>`).join('')}</div></section>
    <p class="garage-unlock" id="garage-reputation">Reputacja: ${reputation} REP · ${reputation >= GARAGE_ELITE_REPUTATION ? 'Części elitarne poziomu 3 odblokowane.' : `Części poziomu 3 od ${GARAGE_ELITE_REPUTATION} REP. Wykonuj zlecenia kontaktów.`}</p><div class="garage-upgrades">${(['engine', 'brakes', 'nitro'] as const).map(upgrade => {
      const price = garageUpgradePrice(garage, upgrade), current = settings[upgrade];
      const locked = current === GARAGE_MAX_LEVEL - 1 && reputation < GARAGE_ELITE_REPUTATION;
      return `<section class="garage-upgrade"><div><h3>${GARAGE_UPGRADE_NAMES[upgrade]}</h3><span class="garage-level" id="garage-level-${upgrade}">Poziom ${current}/${GARAGE_MAX_LEVEL}</span></div><p>${upgradeDescriptions[upgrade]}</p><div class="garage-upgrade-footer"><span class="garage-level-bars" aria-hidden="true">${Array.from({length:GARAGE_MAX_LEVEL},(_,index)=>`<i class="${current > index ? 'is-filled' : ''}"></i>`).join('')}</span><button id="garage-upgrade-${upgrade}" class="garage-button" ${this.pending || price === null || wallet < price || locked ? 'disabled' : ''}>${price === null ? 'Maksymalny poziom' : locked ? `Poziom 3 · od ${GARAGE_ELITE_REPUTATION} REP` : `Ulepsz · ${money(price)}`}</button></div></section>`;
    }).join('')}</div></section></div>
    <footer class="garage-footer"><p id="garage-message" role="status" aria-live="polite">${safe(this.pending ? 'Warsztat potwierdza zlecenie…' : this.message || 'Kupno i tuning nie naprawiają uszkodzeń samochodu.')}</p><span>ESC · WRÓĆ</span></footer></section>`;
    this.query('#garage-close')?.addEventListener('click', () => this.close());
    for (const car of Object.values(GARAGE_CARS)) {
      this.query(`#garage-buy-${car.id}`)?.addEventListener('click', () => this.request({ type: 'buy', car: car.id }));
      this.query(`#garage-select-${car.id}`)?.addEventListener('click', () => this.request({ type: 'select', car: car.id }));
    }
    for (const item of GARAGE_PAINTS) this.query(`#garage-paint-${item.color.toString(16)}`)?.addEventListener('click', () => this.request({ type: 'paint', color: item.color }));
    for (const upgrade of ['engine', 'brakes', 'nitro'] as const) this.query(`#garage-upgrade-${upgrade}`)?.addEventListener('click', () => this.request({ type: 'upgrade', upgrade }));
    const focus = focusId ? this.query<HTMLButtonElement>(`#${CSS.escape(focusId)}`) : null;
    if (focus && !focus.disabled) focus.focus({ preventScroll: true });
    else if (!this.root.contains(document.activeElement)) this.query('#garage-close')?.focus({ preventScroll: true });
  }
}
