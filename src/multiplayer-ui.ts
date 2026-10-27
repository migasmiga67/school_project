import './multiplayer.css';
import type { MultiplayerSession } from './multiplayer-model';

interface MultiplayerCallbacks {
  onEnter: () => void;
  onClose: () => void;
  onOpen: () => void;
  onMessage: (text: string) => void;
}
const safe = (value: string) => value.replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]!));
const nameKey = 'neon-coast-online-name';

/** Room controls keep connection state in MultiplayerSession, never in the DOM. */
export class MultiplayerUI {
  private root: HTMLDivElement | null = null;
  private visible = false;
  private name = '';
  private code = '';
  private error = '';
  private notice = '';
  private busy = false;
  private leavePending = false;
  private operation = 0;
  private signature = '';
  private previousFocus: HTMLElement | null = null;
  private unsubscribe: () => void;

  constructor(private parent: HTMLElement, private session: MultiplayerSession, private callbacks: MultiplayerCallbacks) {
    try { this.name = localStorage.getItem(nameKey) ?? ''; } catch { /* A name can be entered without storage. */ }
    this.code = this.normalizeCode(new URL(location.href).searchParams.get('room') ?? '');
    this.unsubscribe = session.subscribe(state => {
      const snapshot = state.snapshot;
      const signature = JSON.stringify([state.status, state.message, snapshot?.code, snapshot?.members.map(member => [member.id, member.name, member.slot])]);
      if (signature === this.signature) return;
      this.signature = signature;
      if (state.status !== 'connecting') this.busy = false;
      if (state.status === 'error') this.error = state.message || 'Nie udało się połączyć. Spróbuj ponownie.';
      else if (state.status === 'online') { this.error = ''; this.code = snapshot?.code ?? this.code; }
      if (this.visible) this.render();
    });
  }
  get active() { return this.visible; }
  open() {
    if (this.visible) return;
    this.visible = true; this.leavePending = false; this.notice = ''; this.error = '';
    this.previousFocus = document.activeElement as HTMLElement;
    this.root = document.createElement('div'); this.root.className = 'online-overlay'; this.root.id = 'online-dialog';
    this.root.setAttribute('role', 'dialog'); this.root.setAttribute('aria-modal', 'true'); this.root.setAttribute('aria-labelledby', 'online-heading'); this.root.setAttribute('aria-describedby', 'online-description');
    this.root.addEventListener('keydown', event => {
      event.stopPropagation();
      if (event.key === 'Escape') { event.preventDefault(); this.handleEscape(); }
      else if (event.key === 'Tab') this.trapFocus(event);
      else if (event.key === 'Enter' && event.target instanceof HTMLInputElement && this.session.state.status !== 'online') {
        event.preventDefault(); void this.connect(event.target.id === 'online-room' ? 'join' : 'create');
      }
    });
    this.parent.append(this.root); this.callbacks.onOpen(); this.render();
    this.query<HTMLElement>(this.session.state.status === 'online' ? '#online-enter' : '#online-name')?.focus({preventScroll: true});
  }
  close() {
    if (!this.visible) return;
    const cancelConnection = this.session.state.status === 'connecting';
    const previousFocus = this.previousFocus;
    this.operation++; this.busy = false; this.previousFocus = null;
    this.visible = false; this.leavePending = false; this.root?.remove(); this.root = null;
    if (cancelConnection) this.session.leave();
    this.callbacks.onClose();
    // Entering the city can hide the original start-menu button in this same
    // event. Restore focus after that callback, to a control that is still shown.
    queueMicrotask(() => {
      if (this.visible) return;
      const visible = (element: HTMLElement | null): element is HTMLElement => Boolean(element?.isConnected && element.getClientRects().length && element.tagName !== 'BODY' && !element.matches(':disabled'));
      const fallback = document.querySelector<HTMLElement>('#online');
      const target = visible(previousFocus) ? previousFocus : visible(fallback) ? fallback : null;
      target?.focus({preventScroll: true});
    });
  }
  handleEscape() { if (this.leavePending) { this.leavePending = false; this.render(); this.query('#online-leave')?.focus(); } else this.close(); }
  destroy() { this.operation++; this.unsubscribe(); this.close(); }
  private query<T extends HTMLElement = HTMLElement>(selector: string) { return this.root?.querySelector<T>(selector) ?? null; }
  private normalizeCode(raw: string) {
    let value = raw.trim();
    if (/^https?:\/\//i.test(value)) { try { value = new URL(value).searchParams.get('room') ?? ''; } catch { return ''; } }
    return value.toUpperCase().replace(/[\s-]/g, '');
  }
  private trapFocus(event: KeyboardEvent) {
    const area = this.leavePending ? this.query('#online-leave-dialog') : this.root;
    const controls = [...(area?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),summary,a[href]') ?? [])];
    const first = controls[0], last = controls.at(-1);
    if (!first) { event.preventDefault(); return; }
    if (!controls.includes(document.activeElement as HTMLElement)) { (event.shiftKey ? last : first)?.focus(); event.preventDefault(); }
    else if (event.shiftKey && document.activeElement === first) { last?.focus(); event.preventDefault(); }
    else if (!event.shiftKey && document.activeElement === last) { first.focus(); event.preventDefault(); }
  }
  private async connect(kind: 'create' | 'join') {
    if (this.busy || this.session.state.status === 'connecting' || this.session.state.status === 'online') return;
    this.name = this.query<HTMLInputElement>('#online-name')?.value.trim() ?? this.name;
    this.code = this.normalizeCode(this.query<HTMLInputElement>('#online-room')?.value ?? this.code);
    if (this.name.length < 2 || this.name.length > 18) { this.error = 'Wpisz nazwę gracza od 2 do 18 znaków.'; this.render(); this.query('#online-name')?.focus(); return; }
    if (kind === 'join' && !/^[A-Z2-9]{8}$/.test(this.code)) { this.error = 'Wpisz ośmioznakowy kod pokoju lub wklej zaproszenie.'; this.render(); this.query('#online-room')?.focus(); return; }
    try { localStorage.setItem(nameKey, this.name); } catch { /* Joining does not require storage. */ }
    this.error = ''; this.notice = ''; this.busy = true; const operation = ++this.operation; this.render();
    try { if (kind === 'create') await this.session.create(this.name); else await this.session.join(this.code, this.name); }
    catch (error) { if (operation === this.operation) this.error = error instanceof Error ? error.message : 'Nie udało się połączyć. Spróbuj ponownie.'; }
    finally { if (operation === this.operation) { this.busy = false; if (this.visible) this.render(); } }
  }
  private invitation(code: string) { const link = new URL(location.href); link.searchParams.set('room', code); link.hash = ''; return link.toString(); }
  private async copyInvitation() {
    const code = this.session.state.snapshot?.code; if (!code) return;
    const invitation = this.invitation(code);
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(invitation); this.notice = 'Zaproszenie skopiowane. Wyślij je znajomemu.';
      const target = this.query('#online-notice'); if (target) target.textContent = this.notice;
    } catch {
      this.notice = 'Zaznaczono zaproszenie. Skopiuj je skrótem Ctrl+C lub z menu telefonu.';
      const input = this.query<HTMLInputElement>('#online-invite'); input?.focus(); input?.select(); input?.setSelectionRange(0, invitation.length);
      const target = this.query('#online-notice'); if (target) target.textContent = this.notice;
    }
  }
  private leave() {
    this.operation++; this.leavePending = false; this.busy = false; this.notice = ''; this.error = '';
    this.session.leave(); this.callbacks.onMessage('Opuściłeś pokój online.'); if (this.visible) this.render();
  }
  private render() {
    if (!this.root || !this.visible) return;
    const focused = document.activeElement;
    const focusId = focused instanceof HTMLElement && this.root.contains(focused) ? focused.id : '';
    const current = this.session.state, snapshot = current.snapshot, connected = current.status === 'online' && snapshot !== null;
    const connecting = this.busy || current.status === 'connecting';
    const host = connected && snapshot.hostId === snapshot.youId;
    this.root.innerHTML = `<section class="online-card"><button id="online-close" class="online-close" aria-label="${connecting ? 'Anuluj łączenie i zamknij panel online' : 'Zamknij panel online'}">×</button><div class="online-eyebrow">NEON COAST · MULTIPLAYER</div><h1 id="online-heading">${connected ? 'Twoje miasto. Wasza ekipa.' : 'Zaproś swoją ekipę.'}</h1><p class="online-description" id="online-description">${connected ? 'Wspólna jazda, spotkania w kasynie i poker między graczami.' : 'Stwórz pokój dla maksymalnie czterech osób albo dołącz do znajomego.'}</p>${connected ? `
      <div class="online-room-code"><span>KOD POKOJU</span><strong id="online-code">${safe(snapshot.code)}</strong><span>${snapshot.members.length} / 4 GRACZY</span></div>
      <div class="online-invitation"><label for="online-invite">Zaproszenie dla znajomego</label><div><input id="online-invite" readonly value="${safe(this.invitation(snapshot.code))}"><button id="online-copy" class="online-button">Kopiuj</button></div><p id="online-notice" role="status">${safe(this.notice)}</p></div>
      <ul class="online-members" aria-label="Gracze w pokoju">${snapshot.members.map(member => `<li><span class="online-member-icon">${safe(member.name.slice(0, 1).toUpperCase())}</span><span>${safe(member.name)}${member.id === snapshot.youId ? '<small>TY</small>' : ''}</span>${member.id === snapshot.hostId ? '<b>GOSPODARZ</b>' : '<b>POŁĄCZONO</b>'}</li>`).join('')}</ul>
      <div class="online-buttons"><button id="online-enter" class="online-button online-button--primary">WEJDŹ DO MIASTA →</button><button id="online-leave" class="online-button online-button--quiet">${host ? 'Zakończ pokój' : 'Opuść pokój'}</button></div>
      <p class="online-note">${host ? 'Jesteś gospodarzem. Zostaw grę otwartą, aby znajomi mogli zostać w pokoju.' : 'Pokój działa, dopóki gospodarz ma otwartą grę.'} Gotówka online należy do tej sesji; twój zapis solo pozostaje osobno.</p>` : `
      <label class="online-label" for="online-name">TWOJA NAZWA</label><input id="online-name" class="online-input" autocomplete="nickname" maxlength="18" value="${safe(this.name)}" placeholder="Np. Nova" ${connecting ? 'disabled' : ''}>
      <div class="online-connect"><section><span class="online-step">NOWA EKIPA</span><h2>Wasz własny pokój</h2><p>Dostaniesz kod i link zaproszenia.</p><button id="online-create" class="online-button online-button--primary" ${connecting ? 'disabled' : ''}>Utwórz pokój</button></section><section><span class="online-step">MASZ ZAPROSZENIE?</span><label for="online-room">Kod pokoju</label><input id="online-room" class="online-input online-code-input" autocomplete="off" spellcheck="false" maxlength="250" value="${safe(this.code)}" placeholder="8 znaków lub link" ${connecting ? 'disabled' : ''}><button id="online-join" class="online-button" ${connecting ? 'disabled' : ''}>Dołącz</button></section></div>
      ${connecting ? '<div class="online-connection-status"><p class="online-connecting" role="status">Łączenie z pokojem…</p><button id="online-cancel-connect" class="online-button online-button--quiet">Anuluj łączenie</button></div>' : ''}${this.error ? `<p class="online-error" role="alert">${safe(this.error)}</p>` : ''}<p class="online-note">Pokój pomieści do 4 osób. Gospodarz utrzymuje połączenie przez swoją przeglądarkę. Po jego wyjściu sesja się kończy.</p>`}</section>${this.leavePending && connected ? `<div class="online-confirm"><section class="online-card online-confirm-card" id="online-leave-dialog" role="alertdialog" aria-modal="true" aria-labelledby="online-leave-heading"><div class="online-eyebrow">${host ? 'ZAKOŃCZENIE SESJI' : 'WYJŚCIE Z POKOJU'}</div><h2 id="online-leave-heading">${host ? 'Zakończyć pokój dla wszystkich?' : 'Opuścić ten pokój?'}</h2><p>${host ? 'Znajomi zostaną rozłączeni. Portfel i żetony tej sesji online nie są zapisywane.' : 'Wrócisz do gry solo. Portfel i żetony tej sesji online nie są zapisywane.'}</p><div class="online-buttons"><button id="online-cancel-leave" class="online-button online-button--primary">Zostań</button><button id="online-confirm-leave" class="online-button">${host ? 'Zakończ pokój' : 'Opuść pokój'}</button></div></section></div>` : ''}`;
    this.query('#online-close')?.addEventListener('click', () => this.close());
    this.query('#online-cancel-connect')?.addEventListener('click', () => this.close());
    this.query<HTMLInputElement>('#online-name')?.addEventListener('input', event => { this.name = (event.target as HTMLInputElement).value; });
    this.query<HTMLInputElement>('#online-room')?.addEventListener('input', event => { this.code = (event.target as HTMLInputElement).value; });
    this.query('#online-create')?.addEventListener('click', () => { void this.connect('create'); });
    this.query('#online-join')?.addEventListener('click', () => { void this.connect('join'); });
    this.query('#online-copy')?.addEventListener('click', () => { void this.copyInvitation(); });
    this.query('#online-enter')?.addEventListener('click', () => { this.close(); this.callbacks.onEnter(); });
    this.query('#online-leave')?.addEventListener('click', () => { this.leavePending = true; this.render(); this.query('#online-cancel-leave')?.focus(); });
    this.query('#online-cancel-leave')?.addEventListener('click', () => { this.leavePending = false; this.render(); this.query('#online-leave')?.focus(); });
    this.query('#online-confirm-leave')?.addEventListener('click', () => this.leave());
    const replacement = focusId ? this.query<HTMLElement>(`#${CSS.escape(focusId)}`) : null;
    if (replacement && !(replacement instanceof HTMLButtonElement && replacement.disabled) && !(replacement instanceof HTMLInputElement && replacement.disabled)) replacement.focus({preventScroll: true});
    else if (!this.root.contains(document.activeElement)) this.query('#online-close')?.focus({preventScroll: true});
  }
}
