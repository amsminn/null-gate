/**
 * Keyboard + mouse + pointer-lock state. Edge-triggered "pressed" sets are
 * cleared by Game at the end of each frame via endFrame().
 */
export class InputManager {
  private keys = new Set<string>();
  private pressed = new Set<string>();
  private mouseDX = 0;
  private mouseDY = 0;
  leftPressed = false;
  rightPressed = false;
  locked = false;
  onLockChange: ((locked: boolean) => void) | null = null;

  private element: HTMLElement;

  constructor(element: HTMLElement) {
    this.element = element;

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
      // keep browser from scrolling / focusing UI while playing
      if (this.locked && ['Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    window.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
    window.addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      if (e.button === 0) this.leftPressed = true;
      if (e.button === 2) this.rightPressed = true;
    });
    window.addEventListener('contextmenu', (e) => e.preventDefault());

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.element;
      if (!this.locked) this.keys.clear();
      this.onLockChange?.(this.locked);
    });
  }

  /** When true, request raw (unaccelerated) deltas. Opt-in: without OS
   *  pointer acceleration a regular mouse feels drastically slower. */
  rawInput = false;

  requestLock(): void {
    if (document.pointerLockElement === this.element) return;
    type LockFn = (options?: { unadjustedMovement?: boolean }) => Promise<void> | undefined;
    const lock = this.element.requestPointerLock as unknown as LockFn;
    let p: Promise<void> | undefined;
    try {
      p = this.rawInput ? lock.call(this.element, { unadjustedMovement: true }) : lock.call(this.element);
    } catch {
      p = lock.call(this.element);
    }
    if (p && typeof p.catch === 'function') {
      // NotSupportedError (raw input unsupported) or rapid-relock rejection:
      // fall back to a plain lock, swallow further failures.
      p.catch(() => {
        const retry = lock.call(this.element);
        if (retry && typeof retry.catch === 'function') retry.catch(() => {});
      });
    }
  }

  releaseLock(): void {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  isDown(code: string): boolean {
    return this.keys.has(code);
  }

  wasPressed(code: string): boolean {
    return this.pressed.has(code);
  }

  consumeMouseDelta(): { x: number; y: number } {
    const d = { x: this.mouseDX, y: this.mouseDY };
    this.mouseDX = 0;
    this.mouseDY = 0;
    return d;
  }

  endFrame(): void {
    this.pressed.clear();
    this.leftPressed = false;
    this.rightPressed = false;
  }
}
