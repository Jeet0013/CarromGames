/**
 * Transient on-screen messages.
 *
 * A pure observer: it subscribes to `ui:notify` and knows nothing about the
 * rules. That one-way flow is why the rule engine can be tested with no DOM at
 * all.
 *
 * A provisional home for these — the full HUD arrives in the UI phase — but the
 * messages are required now, because a Queen you must cover is not discoverable
 * from the board alone.
 */

const TONE_STYLES = {
  good: { border: 'rgba(120, 200, 130, 0.55)', text: '#d8f5dc' },
  bad: { border: 'rgba(220, 110, 90, 0.6)', text: '#ffd9cf' },
  neutral: { border: 'rgba(176, 122, 69, 0.5)', text: '#f4ece1' },
} as const;

/** How long a message stays up. */
const LIFETIME_MS = 1900;

export type NotificationTone = keyof typeof TONE_STYLES;

export class Notifications {
  readonly #root: HTMLElement;
  /** Sticky banner for a standing obligation, e.g. COVER THE QUEEN. */
  readonly #banner: HTMLElement;
  readonly #timers = new Set<number>();

  constructor(container: HTMLElement) {
    this.#root = document.createElement('div');
    this.#root.style.cssText = [
      'position:absolute',
      'top:max(16px, env(safe-area-inset-top))',
      'left:50%',
      'transform:translateX(-50%)',
      'display:flex',
      'flex-direction:column',
      'align-items:center',
      'gap:8px',
      // Never intercept a striker drag.
      'pointer-events:none',
      'z-index:30',
      'width:max-content',
      'max-width:90vw',
    ].join(';');

    this.#banner = document.createElement('div');
    this.#banner.style.cssText = this.#chipStyle('bad') + ';display:none';

    this.#root.append(this.#banner);
    container.append(this.#root);
  }

  #chipStyle(tone: NotificationTone): string {
    const style = TONE_STYLES[tone];
    return [
      'padding:8px 16px',
      'border-radius:999px',
      `border:1px solid ${style.border}`,
      'background:rgba(18,16,14,0.86)',
      `color:${style.text}`,
      'font:600 13px/1.2 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
      'letter-spacing:0.08em',
      'text-transform:uppercase',
      'white-space:nowrap',
      'backdrop-filter:blur(6px)',
    ].join(';');
  }

  /** Show a message that fades on its own. */
  show(message: string, tone: NotificationTone = 'neutral'): void {
    const chip = document.createElement('div');
    chip.style.cssText =
      this.#chipStyle(tone) + ';opacity:0;transition:opacity 160ms ease, transform 160ms ease';
    chip.style.transform = 'translateY(-6px)';
    chip.textContent = message;
    this.#root.append(chip);

    // Next frame, so the transition has an initial state to animate from.
    requestAnimationFrame(() => {
      chip.style.opacity = '1';
      chip.style.transform = 'translateY(0)';
    });

    const fade = window.setTimeout(() => {
      chip.style.opacity = '0';
      const remove = window.setTimeout(() => chip.remove(), 220);
      this.#timers.add(remove);
    }, LIFETIME_MS);
    this.#timers.add(fade);
  }

  /**
   * Pin a standing obligation until cleared.
   *
   * Distinct from `show` because COVER THE QUEEN is a *state*, not an event —
   * fading it after two seconds would leave the player with no way to find out
   * what they still owe.
   */
  setBanner(message: string | null): void {
    if (message === null) {
      this.#banner.style.display = 'none';
      return;
    }
    this.#banner.textContent = message;
    this.#banner.style.display = 'block';
  }

  dispose(): void {
    for (const timer of this.#timers) window.clearTimeout(timer);
    this.#timers.clear();
    this.#root.remove();
  }
}
