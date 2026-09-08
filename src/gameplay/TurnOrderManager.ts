/**
 * Turn order.
 *
 * Order is data, not a rule buried in the engine, so a mode can change who
 * plays after whom without touching the rest of the game. Two-player alternates
 * because its order happens to have two entries — there is no separate code
 * path for it.
 *
 * The default four-player order is P1 → P2 → P3 → P4, which with the specified
 * seating (P1 left, P2 top, P3 right, P4 bottom) means play passes around the
 * board and, in team mode, alternates between opposing teams every turn.
 */

import type { PlayerSlot } from '../core/types';

export class TurnOrderManager {
  #order: PlayerSlot[];
  #index = 0;

  constructor(order: readonly PlayerSlot[]) {
    if (order.length === 0) throw new Error('Turn order cannot be empty');
    this.#order = [...order];
  }

  get order(): readonly PlayerSlot[] {
    return this.#order;
  }

  get current(): PlayerSlot {
    return this.#order[this.#index] as PlayerSlot;
  }

  /** Replace the order, restarting from its first seat. */
  setOrder(order: readonly PlayerSlot[]): void {
    if (order.length === 0) throw new Error('Turn order cannot be empty');
    this.#order = [...order];
    this.#index = 0;
  }

  /** Advance to the next seat and return it. */
  advance(): PlayerSlot {
    this.#index = (this.#index + 1) % this.#order.length;
    return this.current;
  }

  /**
   * Who plays after `slot`, without advancing.
   *
   * Falls back to the first seat if `slot` is not in the order, so a stale
   * reference cannot wedge the game.
   */
  peekAfter(slot: PlayerSlot): PlayerSlot {
    const index = this.#order.indexOf(slot);
    if (index < 0) return this.#order[0] as PlayerSlot;
    return this.#order[(index + 1) % this.#order.length] as PlayerSlot;
  }

  /** Jump to a seat, e.g. when restoring a saved match. */
  setCurrent(slot: PlayerSlot): void {
    const index = this.#order.indexOf(slot);
    if (index >= 0) this.#index = index;
  }

  reset(): void {
    this.#index = 0;
  }
}
