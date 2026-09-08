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

    for (const seat of seats) {
      this.#panels.set(
        seat.slot,
        new PlayerPanel(this.#container, {
          name: seat.name,
          initials: seat.initials,
          side: seat.side,
          accent: seat.accent,
        }),
      );
    }
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
