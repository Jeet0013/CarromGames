/**
 * In-game HUD: one panel per seat, kept in sync with match state.
 *
 * A pure observer — it subscribes to the bus and reads state, and never calls
 * into the rules. Panels are created for the seats a mode actually uses, so
 * two-player shows two and four-player shows four with no separate layout code.
 */

import type { EventBus } from '../core/EventBus';
import type { MatchState } from '../core/GameState';
import { PlayerSide } from '../core/PlayerSide';
import { PlayerPanel } from './PlayerPanel';
import { PlayerSlot } from '../core/types';

/** Seat identity. Names are placeholders until a profile system exists. */
export interface SeatConfig {
  readonly slot: PlayerSlot;
  readonly side: PlayerSide;
  readonly name: string;
  readonly initials: string;
  readonly accent: string;
}

/**
 * Seat accents.
 *
 * Chosen to stay distinguishable against the board's warm wood *and* from each
 * other — a warm amber, a cool teal, a violet, and a green. Deliberately not
 * red: the Queen owns red on this board, and a red panel would compete with the
 * one piece that must always read as special.
 */
export const SEAT_ACCENTS = {
  bottom: '#e8a33d',
  top: '#4fb3c4',
  left: '#a487e0',
  right: '#6fc08a',
} as const;

export class GameHUD {
  readonly #panels = new Map<PlayerSlot, PlayerPanel>();
  readonly #container: HTMLElement;
  readonly #unsubscribes: Array<() => void> = [];
  #seats: readonly SeatConfig[] = [];
  #narrow = false;
  /**
   * Show only the active seat's panel.
   *
   * With four players, only one is ever playing, so four simultaneous panels
   * are three pieces of furniture competing with the board for a phone screen.
   * Showing just the player whose turn it is frees the whole layout — and with
   * the board rotated to face them, the single panel belongs at the bottom
   * where that player is sitting.
   */
  #activeOnly = false;

  constructor(container: HTMLElement, events: EventBus) {
    this.#container = container;

    // Redraw on anything that can change what a panel shows.
    for (const event of [
      'turn:playerSwitched',
      'turn:changed',
      'pocket:scored',
      'rules:ownershipAssigned',
    ] as const) {
      this.#unsubscribes.push(events.on(event, () => this.#requestSync()));
    }
  }

  /** Build panels for a mode's seats, replacing any existing ones. */
  setSeats(seats: readonly SeatConfig[]): void {
    for (const panel of this.#panels.values()) panel.dispose();
    this.#panels.clear();
    this.#seats = seats;
    this.#narrow = window.innerWidth < 560;

    /*
     * Four players on a phone cannot use their own edges.
     *
     * In portrait the board fills ~92% of the width, so a panel pinned to the
     * left or right edge at mid-height lands on the playfield. The bands above
     * and below the board are free, so all four move there as compact chips —
     * two on top, two below — with the pairing kept as close to the seating as
     * the space allows.
     */
    this.#activeOnly = seats.length > 2;

    // One panel, bottom-left, because the board is turned so the active player
    // is sitting there.
    const soloAnchor = [
      'bottom:max(64px, calc(env(safe-area-inset-bottom) + 58px))',
      'left:max(14px, env(safe-area-inset-left))',
    ];

    seats.forEach((seat) => {
      this.#panels.set(
        seat.slot,
        new PlayerPanel(this.#container, {
          name: seat.name,
          initials: seat.initials,
          side: seat.side,
          accent: seat.accent,
          ...(this.#activeOnly ? { anchor: soloAnchor } : {}),
        }),
      );
    });
  }

  /**
   * Place each panel just outside the board's own edges.
   *
   * `top` and `bottom` are the board's projected screen bounds. Panels sit a
   * fixed gap outside them, clamped so they stay on screen when the board fills
   * the viewport. The active player's panel goes below the board — that player
   * is sitting at the near edge, and their own information belongs on their
   * side of it.
   */
  layoutAroundBoard(top: number, bottom: number, viewportHeight: number): void {
    const GAP = 12;
    const PANEL = 56;
    // Never above the corner controls, never under the power meter.
    const above = Math.min(
      Math.max(GAP, viewportHeight - top + GAP),
      viewportHeight - PANEL - GAP,
    );
    const below = Math.min(Math.max(GAP, bottom + GAP), viewportHeight - PANEL - GAP);

    for (const seat of this.#seats) {
      const panel = this.#panels.get(seat.slot);
      if (!panel) continue;
      // With one panel showing it is always the near player's, so always below.
      if (this.#activeOnly) panel.setEdge('below', below);
      else if (seat.side === PlayerSide.Top) panel.setEdge('above', above);
      else panel.setEdge('below', below);
    }
  }

  /**
   * Re-lay the panels if the viewport crosses the narrow threshold.
   *
   * Rotating a phone with four players changes which layout is viable, and a
   * stale layout would leave chips on the board.
   */
  handleResize(): void {
    const narrow = window.innerWidth < 560;
    if (narrow === this.#narrow) return;
    const seats = this.#seats;
    this.setSeats(seats);
    if (this.#syncTarget) this.sync(this.#syncTarget);
  }

  get seats(): readonly SeatConfig[] {
    return this.#seats;
  }

  /**
   * Pull fresh values from match state.
   *
   * Called explicitly rather than on a timer: the HUD only changes when the
   * match does, and polling would burn frames redrawing identical text.
   */
  sync(match: MatchState): void {
    for (const seat of this.#seats) {
      const player = match.players[seat.slot];
      const isActive = match.currentPlayer === seat.slot;
      // Everyone but the player on turn is hidden entirely.
      if (this.#activeOnly) this.#panels.get(seat.slot)?.setVisible(isActive);
      this.#panels.get(seat.slot)?.update({
        score: player.coinsPocketed,
        coinsPocketed: player.coinsPocketed,
        color: player.color,
        active: match.currentPlayer === seat.slot && match.winner === null,
      });
    }
  }

  /** The bus fires before state settles, so the read is deferred one frame. */
  #pendingSync = false;
  #syncTarget: MatchState | undefined;

  bind(match: MatchState): void {
    this.#syncTarget = match;
    this.sync(match);
  }

  #requestSync(): void {
    if (this.#pendingSync) return;
    this.#pendingSync = true;
    requestAnimationFrame(() => {
      this.#pendingSync = false;
      if (this.#syncTarget) this.sync(this.#syncTarget);
    });
  }

  dispose(): void {
    for (const off of this.#unsubscribes) off();
    this.#unsubscribes.length = 0;
    for (const panel of this.#panels.values()) panel.dispose();
    this.#panels.clear();
  }
}
