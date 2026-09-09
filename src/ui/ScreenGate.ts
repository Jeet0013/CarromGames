/**
 * Refuses the tail end of the gesture that opened a screen.
 *
 * ## The problem this exists for
 *
 * One tap on a touchscreen is not one event. It is pointerdown, pointerup and
 * then a synthesised click, and the browser chooses that click's target by
 * hit-testing the page *after* the earlier handlers have already run. So a
 * screen opened on pointerdown is on-screen and clickable by the time the same
 * tap's click arrives — and the tap that dismissed the splash also pressed
 * whatever had moved under the finger.
 *
 * On a phone that is not a near miss but the common case: the splash's "Tap to
 * start" pill sits almost exactly over the menu's mode cards, so a single tap
 * started the game *and* chose a mode, and the menu appeared to skip.
 *
 * ## Why a timer rather than swallowing the event
 *
 * The obvious fix is for the outgoing screen to stay up and absorb the click.
 * That works only while it is still the answer to the hit test, and browsers
 * disagree about how a click is retargeted when the DOM changes mid-gesture —
 * so it is a fix that holds on the devices you tested and fails on the one you
 * did not.
 *
 * This does not care where the click lands or which element the browser chose.
 * A screen simply does not accept input until it has been up long enough that
 * the press must be a new one. That is true on every engine, and it stays true
 * for gesture sequences nobody has thought of yet.
 *
 * The window is short enough to be imperceptible — no one taps a screen they
 * have not seen yet — and long enough to cover the gap between a finger
 * lifting and the click that follows it.
 */

/** How long a freshly-opened screen ignores input, in milliseconds. */
const SETTLE_MS = 400;

export class ScreenGate {
  #openedAt = Number.NEGATIVE_INFINITY;

  /** Call when the screen becomes visible. */
  open(): void {
    this.#openedAt = performance.now();
  }

  /**
   * Whether a press now is the player's own, rather than the tail of the
   * gesture that opened this screen.
   */
  accepts(): boolean {
    return performance.now() - this.#openedAt >= SETTLE_MS;
  }

  /**
   * Guard a handler.
   *
   * Returns true when the press was swallowed, so a caller reads as
   * `if (gate.blocked(event)) return;`.
   */
  blocked(event?: Event): boolean {
    if (this.accepts()) return false;
    event?.preventDefault();
    event?.stopPropagation();
    return true;
  }
}
