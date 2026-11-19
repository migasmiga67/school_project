import './inventory.css';
import { INVENTORY_MAX_WEIGHT, INVENTORY_SLOTS, ITEMS, ITEM_IDS, inventoryWeight, type Inventory, type ItemId } from './inventory';

export interface InventoryCallbacks {
  getInventory(): Inventory;
  getWallet(): number;
  /** Unpaid fuel at the shop the player stands in, if any. */
  getBill?(): number;
  onUse(item: ItemId): string;
  onBuy(item: ItemId): string;
  onDrop(item: ItemId): string;
  onPayFuel?(): string;
  onOpen(): void;
  onClose(): void;
}
const money = (value: number) => `$${value.toLocaleString('pl-PL')}`;
const kg = (value: number) => `${value.toLocaleString('pl-PL', { maximumFractionDigits: 1 })} kg`;

/** Backpack grid; in a PetroCoast shop it also shows the shelf and the till. */
export class InventoryUI {
  private root: HTMLDivElement | null = null;
  private mode: 'backpack' | 'shop' = 'backpack';
  private shopName = '';
  private selected: ItemId | null = null;
  private message = '';
  private previousFocus: HTMLElement | null = null;
  constructor(private readonly parent: HTMLElement, private readonly callbacks: InventoryCallbacks) {}
  get active() { return Boolean(this.root); }
  open(mode: 'backpack' | 'shop' = 'backpack', shopName = '') {
    this.mode = mode; this.shopName = shopName; this.message = ''; this.selected = this.callbacks.getInventory().slots[0]?.item ?? null;
    if (!this.root) {
      this.previousFocus = document.activeElement as HTMLElement;
      this.root = document.createElement('div'); this.root.id = 'inventory-root'; this.root.className = 'inventory-overlay';
      this.root.setAttribute('role', 'dialog'); this.root.setAttribute('aria-modal', 'true'); this.root.setAttribute('aria-labelledby', 'inventory-heading');
      this.root.addEventListener('keydown', event => {
        event.stopPropagation();
        if (event.key === 'Escape' || (event.key.toLowerCase() === 'i' && this.mode === 'backpack')) { event.preventDefault(); this.close(); }
        else if (event.key === 'Tab') this.trap(event);
      });
      this.parent.append(this.root); this.callbacks.onOpen();
    }
    this.render(); this.root.querySelector<HTMLButtonElement>('#inventory-close')?.focus({ preventScroll: true });
  }
  close() {
    if (!this.root) return;
    this.root.remove(); this.root = null; this.callbacks.onClose();
    if (this.previousFocus?.isConnected) this.previousFocus.focus({ preventScroll: true });
  }
  private trap(event: KeyboardEvent) {
    const buttons = [...(this.root?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])], first = buttons[0], last = buttons.at(-1);
    if (!first) return;
    if (event.shiftKey && document.activeElement === first) { last!.focus(); event.preventDefault(); }
    else if (!event.shiftKey && document.activeElement === last) { first.focus(); event.preventDefault(); }
  }
  private act(text: string) { this.message = text; const focus = document.activeElement?.id; this.render(); if (focus) this.root?.querySelector<HTMLElement>(`#${CSS.escape(focus)}`)?.focus({ preventScroll: true }); }
  private render() {
    if (!this.root) return;
    const inventory = this.callbacks.getInventory(), wallet = this.callbacks.getWallet(), weight = inventoryWeight(inventory);
    if (this.selected && !inventory.slots.some(slot => slot.item === this.selected)) this.selected = inventory.slots[0]?.item ?? null;
    const slots = Array.from({ length: INVENTORY_SLOTS }, (_, index) => inventory.slots[index]);
    const item = this.selected ? ITEMS[this.selected] : null;
    const bill = this.callbacks.getBill?.() ?? 0, shop = this.mode === 'shop';
    this.root.innerHTML = `<section class="inventory-shell ${shop ? 'inventory-shell--shop' : ''}">
      <header class="inventory-header"><div><span class="inventory-eyebrow">${shop ? `${this.shopName.toUpperCase()} · SKLEP 24H` : 'EKWIPUNEK'}</span><h1 id="inventory-heading">${shop ? 'Sklep na stacji' : 'Plecak'}</h1></div>
      <div class="inventory-header-side"><span class="inventory-wallet"><small>GOTÓWKA</small><strong>${money(wallet)}</strong></span><button id="inventory-close" class="inventory-button inventory-button--quiet" aria-label="Zamknij">${shop ? 'Wyjdź ze sklepu' : 'Zamknij'} ×</button></div></header>
      <div class="inventory-body">
      ${shop ? `<section class="inventory-shop" aria-label="Półki sklepu">
        ${bill > 0 ? `<div class="inventory-bill"><div><strong>Paliwo do zapłaty</strong><small>Dystrybutor tej stacji</small></div><button id="inventory-pay" class="inventory-button inventory-button--primary" ${wallet < bill ? 'disabled' : ''}>Zapłać ${money(bill)}</button></div>` : ''}
        <ul class="inventory-shelf">${ITEM_IDS.map(id => { const def = ITEMS[id]; return `<li><span class="inventory-icon" aria-hidden="true">${def.icon}</span><div><strong>${def.name}</strong><small>${def.description}</small><em>${kg(def.weight)}</em></div><button id="inventory-buy-${id}" class="inventory-button" ${wallet < def.price ? 'disabled' : ''}>Kup · ${money(def.price)}</button></li>`; }).join('')}</ul>
      </section>` : ''}
      <section class="inventory-pack" aria-label="Zawartość plecaka">
        <div class="inventory-weight"><span>Waga ${kg(weight)} / ${kg(INVENTORY_MAX_WEIGHT)}</span><span class="inventory-bar"><i style="width:${Math.min(100, weight / INVENTORY_MAX_WEIGHT * 100)}%"></i></span></div>
        <div class="inventory-grid">${slots.map((slot, index) => slot ? `<button id="inventory-slot-${index}" class="inventory-slot ${slot.item === this.selected ? 'inventory-slot--selected' : ''}" aria-pressed="${slot.item === this.selected}" aria-label="${ITEMS[slot.item].name}, ${slot.count} szt."><span aria-hidden="true">${ITEMS[slot.item].icon}</span><b>${slot.count > 1 ? `×${slot.count}` : ''}</b><small>${ITEMS[slot.item].name}</small></button>` : `<div class="inventory-slot inventory-slot--empty" aria-hidden="true"></div>`).join('')}</div>
        ${item ? `<div class="inventory-detail"><span class="inventory-icon" aria-hidden="true">${item.icon}</span><div><strong>${item.name}</strong><p>${item.description}</p></div><div class="inventory-actions">${item.use === 'passive' ? '<span class="inventory-passive">Działa z plecaka</span>' : `<button id="inventory-use" class="inventory-button inventory-button--primary">Użyj</button>`}<button id="inventory-drop" class="inventory-button inventory-button--quiet">Wyrzuć</button></div></div>` : '<p class="inventory-empty">Plecak jest pusty. Kup coś w sklepie na stacji PetroCoast.</p>'}
      </section></div>
      <footer class="inventory-footer"><p id="inventory-message" role="status" aria-live="polite">${this.message || (shop ? 'Zakupy trafiają prosto do plecaka.' : 'I lub Esc zamyka plecak. Przedmioty do auta używasz, stojąc przy nim.')}</p></footer>
    </section>`;
    const on = (selector: string, handler: () => void) => this.root?.querySelector(selector)?.addEventListener('click', handler);
    on('#inventory-close', () => this.close());
    on('#inventory-pay', () => this.act(this.callbacks.onPayFuel?.() ?? ''));
    for (const id of ITEM_IDS) on(`#inventory-buy-${id}`, () => { this.selected = id; this.act(this.callbacks.onBuy(id)); });
    slots.forEach((slot, index) => { if (slot) on(`#inventory-slot-${index}`, () => { this.selected = slot.item; this.act(this.message); }); });
    on('#inventory-use', () => this.selected && this.act(this.callbacks.onUse(this.selected)));
    on('#inventory-drop', () => this.selected && this.act(this.callbacks.onDrop(this.selected)));
  }
}
