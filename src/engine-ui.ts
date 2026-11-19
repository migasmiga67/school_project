import './engine.css';
import { FUEL_GRADES, FUEL_STEPS, FUEL_TANK, fuelHint, owed, type FuelSession } from './fuel-stations';
import { OIL_CAPACITY, SERVICE_STEPS, engineWarnings, serviceHint, WARNING_TEXT, type EngineCare, type EngineRun, type OilService } from './engine';

const litres = (value: number) => `${value.toLocaleString('pl-PL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} L`;
const percent = (value: number) => `${Math.round(value * 100)}%`;

/** Non-modal workshop checklist and crosshair. The 3D bay stays fully visible and interactive. */
export class EngineServiceUI {
  private readonly panel = document.createElement('aside');
  private readonly crosshair = document.createElement('div');
  private signature = '';
  constructor(parent: HTMLElement) {
    this.panel.id = 'engine-service'; this.panel.className = 'engine-service hidden'; this.panel.setAttribute('aria-live', 'polite');
    this.crosshair.id = 'service-crosshair'; this.crosshair.className = 'service-crosshair hidden';
    parent.append(this.panel, this.crosshair);
  }
  hide() { this.panel.classList.add('hidden'); this.crosshair.classList.add('hidden'); this.signature = ''; }
  render(carName: string, care: EngineCare, run: EngineRun, service: OilService, target: boolean, crouched: boolean) {
    this.panel.classList.remove('hidden'); this.crosshair.classList.remove('hidden');
    this.crosshair.classList.toggle('service-crosshair--target', target);
    const signature = JSON.stringify([carName, care.oil.toFixed(2), care.life.toFixed(2), care.wear.toFixed(2), run.running, Math.round(run.rpm / 50), service, crouched]);
    if (signature === this.signature) return; this.signature = signature;
    const level = Math.min(1.25, care.oil / OIL_CAPACITY), warnings = engineWarnings(care, run);
    this.panel.innerHTML = `<span class="engine-eyebrow">MOD SHOP · SERWIS SILNIKA</span><h2>${carName}</h2>
    <div class="engine-gauges">
      <div><small>OLEJ W SILNIKU</small><strong>${litres(care.oil)} <em>/ ${litres(OIL_CAPACITY)}</em></strong><span class="engine-bar"><i style="width:${Math.min(100, level / 1.25 * 100)}%" class="${level < .67 ? 'is-low' : level > 1.13 ? 'is-high' : ''}"></i><b style="left:${.67 / 1.25 * 100}%"></b><b style="left:${1 / 1.25 * 100}%"></b></span></div>
      <div><small>JAKOŚĆ OLEJU</small><strong>${percent(care.life)}</strong><span class="engine-bar"><i style="width:${care.life * 100}%;background:${care.life > .6 ? '#d9b04a' : care.life > .3 ? '#8b6a2a' : '#4a3517'}"></i></span></div>
      <div><small>SILNIK</small><strong>${run.running ? `${Math.round(run.rpm)} obr/min` : 'wyłączony'}</strong><span class="engine-state">Zużycie ${percent(care.wear)} · filtr ${service.filter === 'new' ? 'nowy' : service.filter === 'none' ? 'brak!' : 'stary'}</span></div>
      <div><small>MISKA / KANISTER</small><strong>${litres(service.pan)} <em>· ${litres(service.bottle)}</em></strong><span class="engine-state">Przebieg ${Math.round(care.km).toLocaleString('pl-PL')} km</span></div>
    </div>
    ${warnings.length ? `<p class="engine-warning">⚠ ${warnings.map(item => WARNING_TEXT[item]).join(' · ')}</p>` : ''}
    <ol class="engine-steps">${SERVICE_STEPS.map(step => `<li class="${service.done.includes(step.id) ? 'is-done' : ''}">${step.text}</li>`).join('')}</ol>
    <p class="engine-hint">${serviceHint(care, service)}</p>
    <p class="engine-keys"><kbd>Mysz</kbd> celuj · <kbd>E</kbd>/<kbd>klik</kbd> użyj · <kbd>X</kbd> ${crouched ? 'wstań' : 'kucnij'} · <kbd>Q</kbd> ${run.running ? 'zgaś' : 'uruchom'} silnik · <kbd>O</kbd> zakończ</p>`;
  }
  /** Refuelling uses the same panel: tank gauge, pump display and the steps. */
  renderFuel(stationName: string, care: EngineCare, session: FuelSession, target: boolean) {
    this.panel.classList.remove('hidden'); this.crosshair.classList.remove('hidden');
    this.crosshair.classList.toggle('service-crosshair--target', target);
    const signature = JSON.stringify(['fuel', stationName, care.fuel.toFixed(1), session]);
    if (signature === this.signature) return; this.signature = signature;
    const done = [session.flapOpen || session.litres > 0, Boolean(session.grade), session.nozzle !== 'pump' || session.litres > 0, session.litres > 0, session.litres > 0 && session.nozzle === 'pump', false];
    this.panel.innerHTML = `<span class="engine-eyebrow">STACJA PALIW · DYSTRYBUTOR</span><h2>${stationName}</h2>
    <div class="engine-gauges">
      <div><small>BAK</small><strong>${litres(care.fuel)} <em>/ ${FUEL_TANK} L</em></strong><span class="engine-bar"><i style="width:${Math.min(100, care.fuel / FUEL_TANK * 100)}%" class="${care.fuel < 7 ? 'is-low' : ''}"></i></span></div>
      <div><small>PALIWO</small><strong>${session.grade ? FUEL_GRADES[session.grade].name : '—'}</strong><span class="engine-state">${session.grade ? `$${FUEL_GRADES[session.grade].price.toFixed(2)} za litr` : 'Wybierz na dystrybutorze'}</span></div>
      <div><small>ZATANKOWANO</small><strong>${litres(session.litres)}</strong></div>
      <div><small>DO ZAPŁATY</small><strong>$${owed(session)}</strong><span class="engine-state">Płatność przy kasie w sklepie</span></div>
    </div>
    ${session.grade === 'ON' ? '<p class="engine-warning">⚠ Olej napędowy! Twoje auto ma silnik benzynowy.</p>' : ''}
    <ol class="engine-steps">${FUEL_STEPS.map((step, index) => `<li class="${done[index] ? 'is-done' : ''}">${step}</li>`).join('')}</ol>
    <p class="engine-hint">${fuelHint(session, care)}</p>
    <p class="engine-keys"><kbd>Mysz</kbd> celuj · <kbd>E</kbd>/<kbd>klik</kbd> użyj · <kbd>O</kbd> odejdź od dystrybutora</p>`;
  }
  destroy() { this.panel.remove(); this.crosshair.remove(); }
}
