/** F3 debug overlay: FPS / position / velocity / level. Pure DOM, no three.js deps. */
export class DebugOverlay {
  private el: HTMLDivElement;
  private visible = false;
  private frames = 0;
  private accum = 0;
  private fps = 0;

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.id = 'debug';
    parent.appendChild(this.el);
  }

  toggle(): void {
    this.visible = !this.visible;
    this.el.classList.toggle('visible', this.visible);
  }

  update(
    dt: number,
    info: { pos: { x: number; y: number; z: number }; vel: { x: number; y: number; z: number }; level: string; grounded: boolean }
  ): void {
    this.frames++;
    this.accum += dt;
    if (this.accum >= 0.5) {
      this.fps = Math.round(this.frames / this.accum);
      this.frames = 0;
      this.accum = 0;
    }
    if (!this.visible) return;
    const f = (n: number) => n.toFixed(2).padStart(7);
    const speed = Math.hypot(info.vel.x, info.vel.z);
    this.el.textContent =
      `FPS    ${String(this.fps).padStart(4)}\n` +
      `POS   ${f(info.pos.x)} ${f(info.pos.y)} ${f(info.pos.z)}\n` +
      `VEL   ${f(info.vel.x)} ${f(info.vel.y)} ${f(info.vel.z)}\n` +
      `HSPD  ${f(speed)}  GND ${info.grounded ? 'Y' : 'N'}\n` +
      `LEVEL  ${info.level}`;
  }
}
