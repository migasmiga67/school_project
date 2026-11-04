import './graphics.css';
import type { GraphicsProfile, GraphicsQuality } from './graphics';

interface GraphicsCallbacks {getProfile():GraphicsProfile;software:boolean;onChange(quality:GraphicsQuality):boolean;onClose():void}
const names={auto:'Automatyczna',low:'Niska',medium:'Średnia',high:'Wysoka'} as const;

export class GraphicsUI {
 private root:HTMLElement|null=null;
 private saved:boolean|undefined;
 constructor(private readonly parent:HTMLElement,private readonly callbacks:GraphicsCallbacks){}
 get active(){return this.root!==null;}
 open(){
  if(this.root)return;
  this.saved=undefined;
  const root=this.root=document.createElement('section');root.className='overlay graphics-overlay';
  root.innerHTML=`<div class="dialog graphics-dialog" id="graphics-dialog" role="dialog" aria-modal="true" aria-labelledby="graphics-title"><span class="eyebrow">NEON COAST · USTAWIENIA</span><h2 id="graphics-title">GRAFIKA</h2><p>Dopasuj szczegółowość miasta do swojego urządzenia. Zmiany zobaczysz od razu.</p><label for="graphics-preset">Jakość obrazu</label><select id="graphics-preset">${(Object.keys(names) as GraphicsQuality[]).map(value=>`<option value="${value}">${names[value]}</option>`).join('')}</select><div class="graphics-presets"><p><strong>Niska</strong> · krótszy zasięg widzenia i lżejsze efekty.</p><p><strong>Średnia</strong> · więcej detali i oświetlenia.</p><p><strong>Wysoka</strong> · dalszy widok, dokładniejsze cienie i odbicia.</p></div><p id="graphics-status" role="status" aria-live="polite"></p>${this.callbacks.software?'<small>Na tym urządzeniu cienie i kosztowne efekty są ograniczone, aby zachować płynność.</small>':''}<div class="buttons"><button class="primary" id="graphics-close">GOTOWE →</button></div></div>`;
  root.addEventListener('keydown',event=>{
   event.stopPropagation();
   if(event.key==='Escape'){event.preventDefault();this.close();return;}
   if(event.key==='Tab'){
    const controls=[...root.querySelectorAll<HTMLElement>('select,button')],first=controls[0],last=controls.at(-1);
    if(event.shiftKey&&document.activeElement===first){last?.focus();event.preventDefault();}
    else if(!event.shiftKey&&document.activeElement===last){first?.focus();event.preventDefault();}
   }
  });
  this.parent.append(root);
  const select=root.querySelector<HTMLSelectElement>('#graphics-preset')!;select.value=this.callbacks.getProfile().requested;
  select.onchange=()=>{const saved=this.callbacks.onChange(select.value as GraphicsQuality);this.status(saved);};
  root.querySelector<HTMLButtonElement>('#graphics-close')!.onclick=()=>this.close();this.status();select.focus();
 }
 close(){if(!this.root)return;this.root.remove();this.root=null;this.callbacks.onClose();}
 refresh(){if(this.root)this.status();}
 private status(saved?:boolean){
  if(saved!==undefined)this.saved=saved;
  const profile=this.callbacks.getProfile();
  const text=`Aktywna jakość: ${names[profile.resolved]}.${this.saved===undefined?'':this.saved?' Ustawienie zapamiętane.':' Ustawienie działa w tej sesji; zapis przeglądarki jest niedostępny.'}`;
  const status=this.root!.querySelector('#graphics-status')!;if(status.textContent!==text)status.textContent=text;
 }
}
