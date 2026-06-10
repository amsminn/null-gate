export interface Settings {
  sensitivity: number;
  bloom: boolean;
  shadows: boolean;
  /** pointer-lock unadjustedMovement: raw deltas without OS acceleration.
   *  Feels much slower on regular mice, so it is strictly opt-in. */
  rawInput: boolean;
}

const KEY = 'null-gate-save-v1';

/** localStorage-backed progress + options. */
export class GameStateStore {
  unlocked = 0; // highest level index reachable from Continue
  settings: Settings = { sensitivity: 1.0, bloom: true, shadows: true, rawInput: false };

  load(): void {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return;
      const data = JSON.parse(raw) as Partial<{ unlocked: number; settings: Partial<Settings> }>;
      if (typeof data.unlocked === 'number') this.unlocked = data.unlocked;
      if (data.settings) {
        this.settings = { ...this.settings, ...data.settings };
      }
    } catch {
      /* corrupted save — start fresh */
    }
  }

  save(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify({ unlocked: this.unlocked, settings: this.settings }));
    } catch {
      /* storage unavailable (private mode) — non-fatal */
    }
  }

  unlock(levelIndex: number): void {
    if (levelIndex > this.unlocked) {
      this.unlocked = levelIndex;
      this.save();
    }
  }
}
