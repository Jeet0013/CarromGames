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
import { COINS_PER_PLAYER } from '../gameplay/RuleSet';
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

  readonly #swatch: HTMLElement;
  readonly #queen: HTMLElement;
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

    /*
     * The readout.
     *
     * It was one line of text — "LIGHT · 7 LEFT" — which asked the player to
     * decode two things at once: which colour is theirs, and how far along
     * they are. "Light" and "dark" are also not what anyone calls the coins;
     * they are white and black, and the game already calls them that
     * internally.
     *
     * Now the colour is shown as the coin itself, and the count is potted
     * against the total so progress is legible without arithmetic. Tabular
     * figures keep the two panels' numbers in the same columns.
     */
    this.#swatch = document.createElement('span');
    this.#swatch.style.cssText = [
      'width:11px',
      'height:11px',
      'border-radius:50%',
      'flex:0 0 auto',
      'display:none',
      'box-shadow:inset 0 1px 1px rgba(255,255,255,0.35), 0 0 0 1px rgba(0,0,0,0.5)',
    ].join(';');

    // The Queen, shown only by whoever has covered her.
    this.#queen = document.createElement('span');
    this.#queen.textContent = 'Q';
    this.#queen.title = 'Queen covered';
    this.#queen.setAttribute('aria-label', 'Queen covered');
    this.#queen.style.cssText = [
      'display:none',
      'flex:0 0 auto',
      'width:15px',
      'height:15px',
      'border-radius:50%',
      'place-items:center',
      'background:linear-gradient(160deg, #d8483c, #8e1f18)',
      'color:#ffe9c9',
      'font:700 9px/1 system-ui, -apple-system, sans-serif',
      'box-shadow:0 0 8px rgba(216,72,60,0.55), inset 0 1px 0 rgba(255,255,255,0.3)',
    ].join(';');

    this.#coins = document.createElement('div');
    this.#coins.style.cssText = [
      'font:500 12px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace',
      'color:#9a8d7d',
      'letter-spacing:0.06em',
      'font-variant-numeric:tabular-nums',
    ].join(';');

    // Colour, count and Queen sit on one line under the name.
    const status = document.createElement('div');
    status.style.cssText = 'display:flex;align-items:center;gap:6px;min-width:0';
    status.append(this.#swatch, this.#coins, this.#queen);

    text.append(name, status);
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

    this.update({ score: 0, coinsPocketed: 0, color: null, active: false, hasQueen: false });
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
    /** True once this player has pocketed the Queen and covered her. */
    hasQueen: boolean;
  }): void {
    this.#score.textContent = String(state.score);

    const potted = Math.min(COINS_PER_PLAYER, state.coinsPocketed);
    const remaining = Math.max(0, COINS_PER_PLAYER - potted);

    if (state.color === null) {
      // Colour is unassigned until the first pocket; say so rather than guess.
      this.#swatch.style.display = 'none';
      this.#coins.textContent = 'No colour yet';
    } else {
      const white = state.color === CoinColor.White;
      this.#swatch.style.display = 'block';
      this.#swatch.style.background = white
        ? 'radial-gradient(circle at 36% 30%, #ffffff, #d9cdb8)'
        : 'radial-gradient(circle at 36% 30%, #4a423a, #14110e)';
      // Potted over total, then what is left — the two numbers a player
      // actually wants, in a fixed order so the eye can find them.
      this.#coins.textContent = `${white ? 'White' : 'Black'} · ${potted}/${COINS_PER_PLAYER} · ${remaining} left`;
    }

    this.#queen.style.display = state.hasQueen ? 'grid' : 'none';

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
    // Centred on the board's own axis rather than hugging the left margin, so
    // the two panels read as a matched pair above and below it.
    this.#root.style.left = '50%';
    this.#root.style.right = 'auto';
    this.#root.style.transform = 'translateX(-50%)';
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
