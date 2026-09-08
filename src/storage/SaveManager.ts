/**
 * Persistent player data.
 *
 * A thin, defensive wrapper over `localStorage`. Every access is wrapped
 * because storage is not merely *empty* in some contexts — it **throws** on
 * access in a private window, when site data is blocked, or inside a
 * thumbnailer. An unguarded read there takes down the whole boot, so the rule
 * here is that saving is best-effort and the game must run identically with no
 * storage at all.
 */

const KEY = 'carrom-arena-3d';
const VERSION = 1;

export interface SaveData {
  version: number;
  /** Cleared only by an explicit reset; drives the first-run tutorial. */
  hasSeenTutorial: boolean;
  settings: {
    sfxEnabled: boolean;
    musicEnabled: boolean;
  };
  stats: {
    matchesPlayed: number;
  };
}

const DEFAULTS: SaveData = {
  version: VERSION,
  hasSeenTutorial: false,
  settings: { sfxEnabled: true, musicEnabled: true },
  stats: { matchesPlayed: 0 },
};

export class SaveManager {
  #data: SaveData = { ...DEFAULTS };
  #available = true;

  constructor() {
    this.#data = this.#load();
  }

  get data(): Readonly<SaveData> {
    return this.#data;
  }

  get isAvailable(): boolean {
    return this.#available;
  }

  #load(): SaveData {
    try {
      const raw = window.localStorage.getItem(KEY);
      if (!raw) return { ...DEFAULTS };

      const parsed = JSON.parse(raw) as Partial<SaveData>;
      // A save from a future or unknown version is discarded rather than
      // half-merged — stale keys are harder to debug than a fresh profile.
      if (parsed.version !== VERSION) return { ...DEFAULTS };

      return {
        ...DEFAULTS,
        ...parsed,
        settings: { ...DEFAULTS.settings, ...parsed.settings },
        stats: { ...DEFAULTS.stats, ...parsed.stats },
      };
    } catch {
      this.#available = false;
      return { ...DEFAULTS };
    }
  }

  /** Merge a partial update and persist. Silent if storage is unavailable. */
  update(patch: Partial<Omit<SaveData, 'version'>>): void {
    this.#data = {
      ...this.#data,
      ...patch,
      settings: { ...this.#data.settings, ...patch.settings },
      stats: { ...this.#data.stats, ...patch.stats },
    };
    try {
      window.localStorage.setItem(KEY, JSON.stringify(this.#data));
    } catch {
      this.#available = false;
    }
  }

  reset(): void {
    this.#data = { ...DEFAULTS };
    try {
      window.localStorage.removeItem(KEY);
    } catch {
      this.#available = false;
    }
  }
}
