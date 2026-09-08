/**
 * One seat's panel: avatar, name, score, coins left, turn indicator.
 *
 * Panels sit at the board's edges, anchored to the side that seat actually
 * shoots from, so a player can find their own panel by looking where they sit.
 * They are deliberately compact and pinned to the viewport corners — the board
 * needs the middle of the screen, and a panel that overlaps it costs the player
 * a shot.
 *
 * Original design: a dark lacquer chip with a warm brass rule, picking up the
 * board's own materials rather than borrowing any existing game's layout.
 */

import { PlayerSide } from '../core/PlayerSide';
import { CoinColor } from '../core/types';

export interface PlayerPanelData {
  readonly name: string;
  /** Two-letter monogram used when there is no avatar image. */
  readonly initials: string;
  readonly side: PlayerSide;
  /** Accent colour for this seat, as a CSS colour. */
  readonly accent: string;
  /**
   * Where to pin the panel, as CSS declarations.
   *
   * Supplied by the HUD rather than derived from `side`, because with four
   * players on a phone the seat's own edge is not available — the board fills
   * the width, and a mid-height panel would sit on the playfield.
   */
  readonly anchor?: readonly string[];
  /**
   * Avatar and score only.
   *
   * Four full panels do not fit around a phone-sized board. Dropping the name
   * and colour line keeps the two things that actually matter mid-match —
   * whose turn it is, and the score — in a chip narrow enough that four of
   * them clear the board entirely.
   */
  readonly compact?: boolean;
}

const COINS_PER_PLAYER = 9;

export class PlayerPanel {
  readonly #root: HTMLElement;
  readonly #avatar: HTMLElement;
  readonly #score: HTMLElement;
  readonly #coins: HTMLElement;
  readonly #turnDot: HTMLElement;
  readonly #accent: string;

  /**
   * Starts undefined rather than false so the first `update` always paints.
   * With a boolean seeded to false, an initial inactive state matched the
   * cached value and the dimmed styling was never applied — leaving both
   * panels looking active before the first turn.
   */
  #active: boolean | undefined;

  readonly #compact: boolean;

  constructor(container: HTMLElement, data: PlayerPanelData) {
    this.#accent = data.accent;
    this.#compact = data.compact ?? false;

    this.#root = document.createElement('div');
    this.#root.style.cssText = this.#position(data.side, data.anchor, this.#compact);

    // ── Avatar ────────────────────────────────────────────────────────────
    this.#avatar = document.createElement('div');
    this.#avatar.textContent = data.initials;
    this.#avatar.style.cssText = [
      'width:36px',
      'height:36px',
      'border-radius:50%',
      'display:grid',
      'place-items:center',
      `background:linear-gradient(160deg, ${data.accent}, ${shade(data.accent, -38)})`,
      'color:#14110e',
      'font:700 13px/1 system-ui, -apple-system, sans-serif',
      'letter-spacing:0.03em',
      'flex:0 0 auto',
      'box-shadow:inset 0 1px 0 rgba(255,255,255,0.35)',
    ].join(';');

    // ── Name + coins ──────────────────────────────────────────────────────
    const text = document.createElement('div');
    text.style.cssText = 'display:flex;flex-direction:column;gap:2px;min-width:0';

    const name = document.createElement('div');
    name.textContent = data.name;
    name.style.cssText = [
      'font:600 13px/1.2 system-ui, -apple-system, sans-serif',
      'color:#f4ece1',
      'letter-spacing:0.04em',
      'white-space:nowrap',
      'overflow:hidden',
      'text-overflow:ellipsis',
      'max-width:112px',
    ].join(';');

    this.#coins = document.createElement('div');
    this.#coins.style.cssText = [
      'font:500 12px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace',
      'color:#9a8d7d',
      'letter-spacing:0.06em',
      'font-variant-numeric:tabular-nums',
    ].join(';');

    text.append(name, this.#coins);
    // A compact chip carries the avatar, the score and the turn dot only.
    if (this.#compact) text.style.display = 'none';

    // ── Score ─────────────────────────────────────────────────────────────
    this.#score = document.createElement('div');
    this.#score.style.cssText = [
      'margin-left:auto',
      'font:700 18px/1 system-ui, -apple-system, sans-serif',
      'color:#f7e7cf',
      'font-variant-numeric:tabular-nums',
      'flex:0 0 auto',
    ].join(';');

    // ── Turn indicator ────────────────────────────────────────────────────
    // A filled dot rather than a text label: it reads at a glance from across
    // a shared device, and costs no horizontal space.
    this.#turnDot = document.createElement('div');
    this.#turnDot.style.cssText = [
      'position:absolute',
      'top:-3px',
      'right:-3px',
      'width:10px',
      'height:10px',
      'border-radius:50%',
      'background:transparent',
      'transition:background 180ms ease, box-shadow 180ms ease',
    ].join(';');

    this.#root.append(this.#avatar, text, this.#score, this.#turnDot);
    container.append(this.#root);

    this.update({ score: 0, coinsPocketed: 0, color: null, active: false });
  }

  /** Anchor the panel, either to its own edge or where the HUD decides. */
  #position(
    side: PlayerSide,
    anchor: readonly string[] | undefined,
    compact: boolean,
  ): string {
    const base = [
      'position:absolute',
      'display:flex',
      'align-items:center',
      'gap:9px',
      'padding:8px 12px',
      'border-radius:12px',
      'background:rgba(20,17,14,0.82)',
      'border:1px solid rgba(176,122,69,0.28)',
      'backdrop-filter:blur(8px)',
      'pointer-events:none',
      'z-index:25',
      compact ? 'min-width:0' : 'min-width:164px',
      compact ? 'padding:7px 10px' : '',
      'transition:border-color 180ms ease, box-shadow 180ms ease, opacity 180ms ease',
    ].filter(Boolean);

    if (anchor) return [...base, ...anchor].join(';');

    // The sound toggle owns the top-right corner, so the top panel is offset
    // left of it rather than tucked underneath.
    const anchors: Record<PlayerSide, string[]> = {
      // Clear of the exit button, which owns the top-left corner.
      [PlayerSide.Top]: ['top:max(14px, env(safe-area-inset-top))', 'left:68px'],
      [PlayerSide.Bottom]: ['bottom:max(46px, calc(env(safe-area-inset-bottom) + 40px))', 'left:14px'],
      [PlayerSide.Left]: ['top:50%', 'left:14px', 'transform:translateY(-50%)'],
      [PlayerSide.Right]: ['top:50%', 'right:14px', 'transform:translateY(-50%)'],
    };

    return [...base, ...anchors[side]].join(';');
  }

  update(state: {
    score: number;
    coinsPocketed: number;
    color: CoinColor | null;
    active: boolean;
  }): void {
    this.#score.textContent = String(state.score);

    const remaining = Math.max(0, COINS_PER_PLAYER - state.coinsPocketed);
    // Colour is unassigned until the first pocket; say so rather than guessing.
    const label =
      state.color === null
        ? 'COLOUR UNCLAIMED'
        : `${state.color === CoinColor.White ? 'LIGHT' : 'DARK'} · ${remaining} LEFT`;
    this.#coins.textContent = label;

    if (state.active !== this.#active) {
      this.#active = state.active;
      this.#root.style.borderColor = state.active
        ? this.#accent
        : 'rgba(176,122,69,0.28)';
      this.#root.style.boxShadow = state.active
        ? `0 0 0 1px ${this.#accent}55, 0 6px 22px rgba(0,0,0,0.45)`
        : 'none';
      this.#root.style.opacity = state.active ? '1' : '0.72';
      this.#turnDot.style.background = state.active ? this.#accent : 'transparent';
      this.#turnDot.style.boxShadow = state.active ? `0 0 10px ${this.#accent}` : 'none';
    }
  }

  /**
   * Pin the panel a fixed gap from a board edge.
   *
   * Passing the board's own screen bounds rather than a viewport corner is what
   * keeps the label reading as part of the board: it tracks the board when the
   * camera reframes, and it can never collide with the corner controls, because
   * it is positioned relative to something that is nowhere near them.
   */
  setEdge(edge: 'above' | 'below', y: number): void {
    if (edge === 'below') {
      this.#root.style.top = `${Math.round(y)}px`;
      this.#root.style.bottom = 'auto';
    } else {
      this.#root.style.bottom = `${Math.round(y)}px`;
      this.#root.style.top = 'auto';
    }
    // A vertical transform would fight the explicit offset.
    this.#root.style.transform = 'none';
  }

  setVisible(visible: boolean): void {
    this.#root.style.display = visible ? 'flex' : 'none';
  }

  dispose(): void {
    this.#root.remove();
  }
}

/** Lighten or darken a hex colour by a percentage. */
function shade(hex: string, percent: number): string {
  const value = hex.replace('#', '');
  const num = Number.parseInt(
    value.length === 3
      ? value
          .split('')
          .map((c) => c + c)
          .join('')
      : value,
    16,
  );
  const clamp = (n: number): number => Math.min(255, Math.max(0, n));
  const amount = Math.round(2.55 * percent);
  const r = clamp((num >> 16) + amount);
  const g = clamp(((num >> 8) & 0x00ff) + amount);
  const b = clamp((num & 0x0000ff) + amount);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}
