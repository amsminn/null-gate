import { Settings } from '../game/GameState';

export interface MenuCallbacks {
  onNewTest(): void;
  onContinue(): void;
  onCombinedTest(): void;
  onResume(): void;
  onRestart(): void;
  onQuitToMenu(): void;
  onSettingsChanged(settings: Settings): void;
  /** any click on a menu surface — used to unlock WebAudio */
  onAnyClick(): void;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = '',
  text = ''
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text) e.textContent = text;
  return e;
}

function button(label: string, className: string, onClick: () => void): HTMLButtonElement {
  const b = el('button', className, label);
  b.addEventListener('click', onClick);
  return b;
}

/**
 * Main menu / options / controls / pause / completion screens.
 * Pure DOM with CSS classes defined in index.html.
 */
export class Menu {
  private main: HTMLDivElement;
  private options: HTMLDivElement;
  private controls: HTMLDivElement;
  private pause: HTMLDivElement;
  private complete: HTMLDivElement;
  private continueBtn: HTMLButtonElement;
  private settings: Settings;
  private cb: MenuCallbacks;

  constructor(parent: HTMLElement, settings: Settings, cb: MenuCallbacks) {
    this.settings = settings;
    this.cb = cb;

    /* ---------- main ---------- */
    this.main = el('div', 'screen');
    const box = el('div', 'menu-box');
    const title = el('div', 'game-title');
    title.appendChild(document.createTextNode('NULL'));
    const em = el('em', '', 'GATE');
    title.appendChild(em);
    box.appendChild(title);
    box.appendChild(el('div', 'game-sub', 'SPATIAL APERTURE TESTING INITIATIVE'));
    box.appendChild(el('div', 'menu-rule'));

    const btns = el('div', 'menu-btns');
    btns.appendChild(button('NEW TEST', 'mbtn', () => cb.onNewTest()));
    this.continueBtn = button('CONTINUE', 'mbtn', () => cb.onContinue());
    btns.appendChild(this.continueBtn);
    btns.appendChild(button('COMBINED TEST', 'mbtn accent', () => cb.onCombinedTest()));
    btns.appendChild(button('OPTIONS', 'mbtn', () => this.swap(this.main, this.options)));
    btns.appendChild(button('CONTROLS', 'mbtn', () => this.swap(this.main, this.controls)));
    box.appendChild(btns);
    box.appendChild(
      el(
        'div',
        'menu-foot',
        'ONE-SHOT LLM BENCHMARK BUILD — ALL GEOMETRY, TEXTURES AND AUDIO ARE PROCEDURAL. CLICK A MODE, THEN CLICK THE SCENE TO CAPTURE THE CURSOR.'
      )
    );
    this.main.appendChild(box);

    /* ---------- options ---------- */
    this.options = el('div', 'screen hidden');
    const obox = el('div', 'menu-box');
    obox.appendChild(el('div', 'panel-title', 'OPTIONS'));

    const sensRow = el('div', 'opt-row');
    sensRow.appendChild(el('label', '', 'MOUSE SENSITIVITY'));
    const sensVal = el('span', 'opt-val', settings.sensitivity.toFixed(1));
    const sens = el('input');
    sens.type = 'range';
    sens.min = '0.2';
    sens.max = '3';
    sens.step = '0.1';
    sens.value = String(settings.sensitivity);
    sens.addEventListener('input', () => {
      this.settings.sensitivity = parseFloat(sens.value);
      sensVal.textContent = this.settings.sensitivity.toFixed(1);
      cb.onSettingsChanged(this.settings);
    });
    sensRow.appendChild(sens);
    sensRow.appendChild(sensVal);
    obox.appendChild(sensRow);

    const mkToggle = (label: string, value: boolean, apply: (v: boolean) => void) => {
      const row = el('div', 'opt-row');
      row.appendChild(el('label', '', label));
      const box2 = el('input');
      box2.type = 'checkbox';
      box2.checked = value;
      box2.addEventListener('change', () => {
        apply(box2.checked);
        cb.onSettingsChanged(this.settings);
      });
      row.appendChild(box2);
      return row;
    };
    obox.appendChild(mkToggle('BLOOM', settings.bloom, (v) => (this.settings.bloom = v)));
    obox.appendChild(mkToggle('SHADOWS', settings.shadows, (v) => (this.settings.shadows = v)));
    obox.appendChild(
      mkToggle('RAW MOUSE INPUT', settings.rawInput, (v) => (this.settings.rawInput = v))
    );

    obox.appendChild(el('div', 'menu-rule'));
    obox.appendChild(button('BACK', 'mbtn', () => this.swap(this.options, this.main)));
    this.options.appendChild(obox);

    /* ---------- controls ---------- */
    this.controls = el('div', 'screen hidden');
    const cbox = el('div', 'menu-box');
    cbox.appendChild(el('div', 'panel-title', 'CONTROLS'));
    const grid = el('div', 'ctl-grid');
    const rows: Array<[string, string]> = [
      ['W A S D', 'Move'],
      ['MOUSE', 'Look'],
      ['LEFT CLICK', 'Fire blue aperture'],
      ['RIGHT CLICK', 'Fire amber aperture'],
      ['SPACE', 'Jump'],
      ['SHIFT', 'Sprint'],
      ['E', 'Lift / release test object'],
      ['R', 'Restart chamber'],
      ['H', 'Controls overlay'],
      ['F3', 'Diagnostics overlay'],
      ['ESC', 'Release cursor / pause'],
    ];
    for (const [k, v] of rows) {
      const row = el('div');
      row.appendChild(el('span', 'k', k));
      row.appendChild(document.createTextNode(v));
      grid.appendChild(row);
    }
    cbox.appendChild(grid);
    cbox.appendChild(el('div', 'menu-rule'));
    cbox.appendChild(button('BACK', 'mbtn', () => this.swap(this.controls, this.main)));
    this.controls.appendChild(cbox);

    /* ---------- pause ---------- */
    this.pause = el('div', 'screen hidden');
    const pbox = el('div', 'menu-box');
    pbox.appendChild(el('div', 'panel-title', 'TEST SUSPENDED'));
    const pbtns = el('div', 'menu-btns');
    pbtns.appendChild(button('RESUME', 'mbtn', () => cb.onResume()));
    pbtns.appendChild(button('RESTART CHAMBER', 'mbtn', () => cb.onRestart()));
    pbtns.appendChild(button('MAIN MENU', 'mbtn', () => cb.onQuitToMenu()));
    pbox.appendChild(pbtns);
    pbox.appendChild(el('div', '', '')).id = 'pause-hint';
    (pbox.querySelector('#pause-hint') as HTMLElement).textContent =
      'POINTER RELEASED — RESUME TO CONTINUE TESTING';
    this.pause.appendChild(pbox);

    /* ---------- completion ---------- */
    this.complete = el('div', 'screen hidden');
    const fbox = el('div', 'menu-box');
    fbox.appendChild(el('div', 'complete-title', 'TEST SEQUENCE COMPLETE'));
    fbox.appendChild(el('div', 'complete-sub', 'ALL APERTURE PROTOCOLS VALIDATED'));
    fbox.appendChild(
      el(
        'div',
        'complete-body',
        'Subject performance: within acceptable parameters. Spatial reasoning: confirmed. The facility thanks you for your compliance.'
      )
    );
    fbox.appendChild(el('div', 'menu-rule'));
    const fbtns = el('div', 'menu-btns');
    fbtns.appendChild(button('MAIN MENU', 'mbtn', () => cb.onQuitToMenu()));
    fbox.appendChild(fbtns);
    this.complete.appendChild(fbox);

    for (const screen of [this.main, this.options, this.controls, this.pause, this.complete]) {
      screen.addEventListener('click', () => cb.onAnyClick());
      parent.appendChild(screen);
    }
  }

  private swap(from: HTMLDivElement, to: HTMLDivElement): void {
    from.classList.add('hidden');
    to.classList.remove('hidden');
  }

  private all(): HTMLDivElement[] {
    return [this.main, this.options, this.controls, this.pause, this.complete];
  }

  hideAll(): void {
    for (const s of this.all()) s.classList.add('hidden');
  }

  showMain(unlocked: number): void {
    this.hideAll();
    this.continueBtn.disabled = unlocked <= 0;
    this.main.classList.remove('hidden');
  }

  showPause(): void {
    this.hideAll();
    this.pause.classList.remove('hidden');
  }

  showComplete(): void {
    this.hideAll();
    this.complete.classList.remove('hidden');
  }
}
