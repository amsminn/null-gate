/**
 * Minimal test-facility HUD. All elements are DOM; styling lives in index.html.
 * Built with createElement/textContent only — no HTML string injection.
 */

function div(id: string, className = ''): HTMLDivElement {
  const el = document.createElement('div');
  if (id) el.id = id;
  if (className) el.className = className;
  return el;
}

/** Renders "normal *highlighted* normal" — asterisk segments become <b>. */
function setRichText(el: HTMLElement, text: string): void {
  el.textContent = '';
  const parts = text.split('*');
  parts.forEach((part, i) => {
    if (i % 2 === 1) {
      const b = document.createElement('b');
      b.textContent = part;
      el.appendChild(b);
    } else if (part) {
      el.appendChild(document.createTextNode(part));
    }
  });
}

export class HUD {
  private root: HTMLDivElement;
  private blueInd: HTMLDivElement;
  private amberInd: HTMLDivElement;
  private levelNum: HTMLDivElement;
  private levelName: HTMLDivElement;
  private objective: HTMLDivElement;
  private promptEl: HTMLDivElement;
  private messageEl: HTMLDivElement;
  private fadeEl: HTMLDivElement;
  private flashEl: HTMLDivElement;
  private controlsEl: HTMLDivElement;
  private messageTimer = 0;
  private flashAlpha = 0;

  constructor(parent: HTMLElement) {
    this.fadeEl = div('fade', 'layer');
    this.flashEl = div('flash', 'layer');
    this.root = div('hud', 'layer');

    const crosshair = div('crosshair');
    crosshair.appendChild(div('', 'dot'));
    this.root.appendChild(crosshair);

    const status = div('portal-status');
    this.blueInd = div('p-blue', 'p-ind');
    this.amberInd = div('p-amber', 'p-ind');
    status.appendChild(this.blueInd);
    status.appendChild(this.amberInd);
    this.root.appendChild(status);

    const tag = div('level-tag');
    this.levelNum = div('', 'lv-num');
    this.levelName = div('', 'lv-name');
    tag.appendChild(this.levelNum);
    tag.appendChild(this.levelName);
    this.root.appendChild(tag);

    this.objective = div('objective');
    this.promptEl = div('prompt');
    this.messageEl = div('message');
    this.root.appendChild(this.objective);
    this.root.appendChild(this.promptEl);
    this.root.appendChild(this.messageEl);

    this.controlsEl = div('controls-overlay');
    const rows: Array<[string, string]> = [
      ['W A S D', 'move'],
      ['MOUSE', 'look'],
      ['LMB / RMB', 'blue / amber aperture'],
      ['SPACE', 'jump'],
      ['SHIFT', 'sprint'],
      ['E', 'lift / release object'],
      ['R', 'restart chamber'],
      ['H', 'toggle this panel'],
      ['F3', 'diagnostics'],
      ['ESC', 'release cursor'],
    ];
    for (const [key, label] of rows) {
      const row = document.createElement('div');
      const k = document.createElement('span');
      k.className = 'k';
      k.textContent = key;
      row.appendChild(k);
      row.appendChild(document.createTextNode(label));
      this.controlsEl.appendChild(row);
    }
    this.root.appendChild(this.controlsEl);

    parent.appendChild(this.root);
    parent.appendChild(this.flashEl);
    parent.appendChild(this.fadeEl);
  }

  show(): void {
    this.root.classList.add('visible');
  }

  hide(): void {
    this.root.classList.remove('visible');
  }

  setLevel(id: string, name: string): void {
    this.levelNum.textContent = `CHAMBER ${id}`;
    this.levelName.textContent = name;
  }

  /** Objective text; segments wrapped in *asterisks* are highlighted. */
  setObjective(text: string): void {
    setRichText(this.objective, text);
  }

  setPortals(blue: boolean, amber: boolean): void {
    this.blueInd.classList.toggle('lit-blue', blue);
    this.amberInd.classList.toggle('lit-amber', amber);
  }

  setPrompt(text: string | null, key?: string): void {
    if (!text) {
      this.promptEl.classList.remove('visible');
      return;
    }
    this.promptEl.textContent = '';
    if (key) {
      const k = document.createElement('span');
      k.className = 'key';
      k.textContent = key;
      this.promptEl.appendChild(k);
    }
    this.promptEl.appendChild(document.createTextNode(text));
    this.promptEl.classList.add('visible');
  }

  showMessage(text: string, seconds = 1.8, color = ''): void {
    this.messageEl.textContent = text;
    this.messageEl.style.color = color;
    this.messageEl.classList.add('visible');
    this.messageTimer = seconds;
  }

  /** Brief full-screen tint (portal traversal, respawn). */
  flash(cssColor: string, alpha = 0.22): void {
    this.flashEl.style.background = cssColor;
    this.flashAlpha = alpha;
  }

  setFade(dark: boolean): void {
    this.fadeEl.style.opacity = dark ? '1' : '0';
  }

  toggleControls(): void {
    this.controlsEl.classList.toggle('visible');
  }

  update(dt: number): void {
    if (this.messageTimer > 0) {
      this.messageTimer -= dt;
      if (this.messageTimer <= 0) this.messageEl.classList.remove('visible');
    }
    if (this.flashAlpha > 0.001) {
      this.flashAlpha *= Math.exp(-6 * dt);
      this.flashEl.style.opacity = String(this.flashAlpha);
    } else if (this.flashEl.style.opacity !== '0') {
      this.flashEl.style.opacity = '0';
    }
  }
}
