/**
 * Typed publish/subscribe bus.
 *
 * Systems talk through this rather than holding references to each other. The
 * UI, audio, and effect layers are pure observers: they subscribe to gameplay
 * events and never call into the rule layer. That one-way flow is what keeps
 * `gameplay/` free of rendering dependencies.
 *
 * The event map grows as phases land; entries are added alongside the system
 * that emits them.
 */

import type {
  CoinColor,
  FoulKind,
  PieceKind,
  PlayerSlot,
  QueenState,
  ShotCommand,
  TurnState,
} from './types';

/**
 * Every event the game can emit, keyed by name.
 *
 * Payloads must stay serializable — no meshes, no rigid bodies. An event that
 * needs to name a piece carries its id, and the renderer resolves it.
 */
export interface GameEvents {
  /** Engine boot finished; systems are wired and the first frame can run. */
  'game:ready': void;
  'game:paused': void;
  'game:resumed': void;

  /** Turn state machine moved. */
  'turn:changed': { readonly from: TurnState; readonly to: TurnState };
  /** Control passed to another seat. */
  'turn:playerSwitched': { readonly to: PlayerSlot };

  /** A shot was released, by a human or the AI — identical payload either way. */
  'shot:fired': { readonly by: PlayerSlot; readonly shot: ShotCommand };
  /** Every body has come to rest; the shot can now be evaluated. */
  'shot:settled': { readonly by: PlayerSlot };
  /**
   * The rules have finished with the shot and the board is final.
   *
   * Distinct from `shot:settled`, which fires *before* evaluation. Anything
   * that needs the post-shot truth — who plays next, where the pieces ended —
   * must wait for this one.
   */
  'shot:resolved': { readonly by: PlayerSlot; readonly nextPlayer: PlayerSlot };

  /**
   * Two pieces met, or a piece hit a rail. `impact` is the planar speed at
   * contact, so audio can scale the hit rather than playing one flat click.
   */
  'physics:contact': {
    readonly kind: 'piece' | 'rail';
    readonly impact: number;
    readonly a?: string;
    readonly b?: string;
  };

  /** A piece dropped into a pocket. */
  'pocket:scored': {
    readonly pieceId: string;
    readonly kind: PieceKind;
    readonly pocketIndex: number;
  };

  /** Coin ownership resolved from the first valid pocket. */
  'rules:ownershipAssigned': { readonly player: PlayerSlot; readonly color: CoinColor };
  'rules:foul': { readonly player: PlayerSlot; readonly kind: FoulKind };
  /** `by` is who took the final shot — not always the winner, since a player's
   *  board can be cleared by their opponent's fouls. */
  'rules:gameComplete': { readonly winner: PlayerSlot; readonly by: PlayerSlot };

  /** Queen lifecycle moved — drives the COVER THE QUEEN indicator. */
  'queen:stateChanged': { readonly from: QueenState; readonly to: QueenState };

  /**
   * Standing Queen obligation, or null to clear it. Separate from `ui:notify`
   * because COVER THE QUEEN is a state the player must be able to look up, not
   * a message that fades.
   */
  'queen:banner': { readonly message: string | null };

  /** Transient HUD toast: NICE SHOT, FOUL, YOUR TURN, … */
  'ui:notify': { readonly message: string; readonly tone: 'good' | 'bad' | 'neutral' };
}

export type GameEventName = keyof GameEvents;

/** Handler for a given event. `void` payloads are called with no argument. */
export type EventHandler<K extends GameEventName> = GameEvents[K] extends void
  ? () => void
  : (payload: GameEvents[K]) => void;

/** Call to remove the subscription that returned it. Idempotent. */
export type Unsubscribe = () => void;

export class EventBus {
  /** Stored loosely; the public API is what enforces payload types. */
  readonly #handlers = new Map<GameEventName, Set<(payload: never) => void>>();

  /** Subscribe to an event. Returns an unsubscribe function. */
  on<K extends GameEventName>(event: K, handler: EventHandler<K>): Unsubscribe {
    let set = this.#handlers.get(event);
    if (!set) {
      set = new Set();
      this.#handlers.set(event, set);
    }
    const stored = handler as (payload: never) => void;
    set.add(stored);

    return () => {
      const current = this.#handlers.get(event);
      if (!current) return;
      current.delete(stored);
      if (current.size === 0) this.#handlers.delete(event);
    };
  }

  /** Subscribe for a single delivery, then auto-unsubscribe. */
  once<K extends GameEventName>(event: K, handler: EventHandler<K>): Unsubscribe {
    const off = this.on(event, ((payload: GameEvents[K]) => {
      off();
      (handler as (p: GameEvents[K]) => void)(payload);
    }) as EventHandler<K>);
    return off;
  }

  /**
   * Emit an event to every current subscriber.
   *
   * Handlers are copied before iteration so a handler may safely unsubscribe
   * itself (or others) mid-dispatch. A throwing handler is reported and
   * skipped rather than aborting the rest — one broken UI listener must never
   * stall the turn machine.
   */
  emit<K extends GameEventName>(
    event: K,
    ...args: GameEvents[K] extends void ? [] : [payload: GameEvents[K]]
  ): void {
    const set = this.#handlers.get(event);
    if (!set || set.size === 0) return;

    const payload = args[0] as never;
    for (const handler of [...set]) {
      try {
        handler(payload);
      } catch (error) {
        console.error(`[EventBus] handler for "${event}" threw:`, error);
      }
    }
  }

  /** Drop handlers for one event, or all handlers when called bare. */
  clear(event?: GameEventName): void {
    if (event === undefined) this.#handlers.clear();
    else this.#handlers.delete(event);
  }

  /** Live subscriber count. Used by the debug overlay and tests. */
  listenerCount(event: GameEventName): number {
    return this.#handlers.get(event)?.size ?? 0;
  }
}
