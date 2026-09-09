/**
 * Vibration, on the events worth feeling.
 *
 * ## Why this is its own module
 *
 * It is tempting to hang `navigator.vibrate` off the audio manager, since it
 * fires on the same events. But haptics is not sound: it works with the phone
 * silenced, it is unavailable on iOS Safari entirely, and it has its own
 * reasons to be switched off. Keeping it separate means the sound toggle
 * controls sound and nothing else.
 *
 * ## What it deliberately does not do
 *
 * Fire on every contact. A carrom shot can produce a dozen collisions in a
 * second, and a phone buzzing through all of them is not feedback — it is a
 * phone that seems to be malfunctioning. Only two things vibrate: a coin going
 * down, and a foul.
 *
 * ## Support
 *
 * `navigator.vibrate` is Android-only in practice; iOS Safari has never
 * implemented it, and the Vibration API is not available in a cross-origin
 * iframe. All three cases are the same to this module: the capability check
 * fails and nothing happens. There is no fallback, because there is nothing to
 * fall back to — an iPhone simply gets the sound.
 */

import type { EventBus } from '../core/EventBus';
import { PieceKind } from '../core/types';

/**
 * Patterns, in milliseconds.
 *
 * Short. A vibration long enough to notice as a duration reads as an alert —
 * a notification, a phone call — rather than as the feel of something landing.
 */
const PATTERN = {
  /** A coin going down: one confident tap. */
  pocket: 35,
  /** The striker going down, or any other foul: two short buzzes, lower. */
  foul: [22, 60, 22],
} as const;

export class Haptics {
  #enabled = true;
  readonly #unsubscribes: Array<() => void> = [];

  constructor(events: EventBus) {
    this.#unsubscribes.push(
      events.on('pocket:scored', ({ kind }) => {
        // The striker going down is a foul; it gets the foul pattern from the
        // rules event rather than a congratulatory tap from this one.
        if (kind === PieceKind.Striker) return;
        this.#buzz(PATTERN.pocket);
      }),
      events.on('rules:foul', () => this.#buzz([...PATTERN.foul])),
    );
  }

  /** Off entirely — for a settings toggle, or a player who finds it annoying. */
  setEnabled(enabled: boolean): void {
    this.#enabled = enabled;
    if (!enabled) this.#cancel();
  }

  #buzz(pattern: number | number[]): void {
    if (!this.#enabled) return;
    if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;

    /*
     * Wrapped, because this throws in more places than the capability check
     * catches: a cross-origin iframe, a browser with the API disabled by
     * policy, and some Android builds that expose the method and reject the
     * call. None of them are worth taking the frame down for.
     */
    try {
      navigator.vibrate(pattern);
    } catch {
      // A phone that will not buzz is not a problem worth reporting.
    }
  }

  #cancel(): void {
    try {
      navigator.vibrate?.(0);
    } catch {
      // Nothing to cancel.
    }
  }

  dispose(): void {
    this.#cancel();
    for (const off of this.#unsubscribes) off();
    this.#unsubscribes.length = 0;
  }
}
