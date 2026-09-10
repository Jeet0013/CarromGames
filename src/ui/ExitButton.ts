/**
 * Leave the current match and return to mode selection.
 *
 * Sits at the top-left, opposite the sound and help controls, because it is the
 * one control a player reaches for when they want *out* — grouping it with the
 * in-match toggles would invite mis-taps in both directions.
 *
 * It asks before leaving. A match can be twenty shots deep and the tap target
 * is deliberately large, so an accidental brush must not throw that away.
 */

import { injectBaseSheet } from './theme';

export class ExitButton {
  readonly #button: HTMLButtonElement;
  readonly #confirm: HTMLElement;
  #confirming = false;

  constructor(container: HTMLElement, onExit: () => void) {
    this.#button = document.createElement('button');
    this.#button.type = 'button';
    this.#button.setAttribute('aria-label', 'Leave match');
    this.#button.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path d="M14 5H7a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h7" fill="none" stroke="#f4ece1" stroke-width="1.8" stroke-linecap="round"/>
      <path d="M17 15l3-3-3-3" fill="none" stroke="#f4ece1" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M20 12h-9" fill="none" stroke="#f4ece1" stroke-width="1.8" stroke-linecap="round"/>
    </svg>`;
    injectBaseSheet();
    this.#button.className = 'cx-icon-btn cx-focus';
    this.#button.style.cssText = [
      'position:absolute',
      'top:max(14px, env(safe-area-inset-top))',
      'left:max(14px, env(safe-area-inset-left))',
      'z-index:41',
    ].join(';');

    // ── Confirmation ──────────────────────────────────────────────────────
    this.#confirm = document.createElement('div');
    this.#confirm.style.cssText = [
      'position:absolute',
      'inset:0',
      'display:none',
      'flex-direction:column',
      'align-items:center',
      'justify-content:center',
      'gap:18px',
      'padding:24px',
      'background:rgba(10,9,8,0.92)',
      'backdrop-filter:blur(5px)',
      'z-index:78',
      'text-align:center',
    ].join(';');

    const question = document.createElement('h2');
    question.textContent = 'Leave this match?';
    question.style.cssText = [
      'margin:0',
      'font:600 clamp(20px, 5vw, 26px)/1.2 system-ui, -apple-system, sans-serif',
      'color:#f7e7cf',
    ].join(';');

    const note = document.createElement('p');
    note.textContent = 'The current game will be lost.';
    note.style.cssText =
      'margin:0;font:400 14px/1.5 system-ui, -apple-system, sans-serif;color:#9a8d7d';

    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;gap:10px;flex-wrap:wrap;justify-content:center';

    const leave = this.#action('Leave', true);
    leave.addEventListener('click', (event) => {
      event.stopPropagation();
      this.#close();
      onExit();
    });

    const stay = this.#action('Keep playing', false);
    stay.addEventListener('click', (event) => {
      event.stopPropagation();
      this.#close();
    });

    actions.append(leave, stay);
    this.#confirm.append(question, note, actions);

    this.#button.addEventListener('click', (event) => {
      // The canvas is underneath; without this the tap also aims a shot.
      event.stopPropagation();
      this.#open();
    });

    container.append(this.#button, this.#confirm);
  }

  #action(label: string, primary: boolean): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    /*
     * The same two buttons as everywhere else, with one exception.
     *
     * Leaving a match is the one destructive action in the game, so the
     * primary here is struck in lacquer rather than in the metal — a warning
     * colour rather than an inviting one. Everything else about it, size,
     * shape, press feel, is the shared button.
     */
    button.className = primary
      ? 'cx-btn cx-btn--danger cx-focus'
      : 'cx-btn cx-btn--quiet cx-focus';
    return button;
  }

  #open(): void {
    this.#confirming = true;
    this.#confirm.style.display = 'flex';
  }

  #close(): void {
    this.#confirming = false;
    this.#confirm.style.display = 'none';
  }

  get isConfirming(): boolean {
    return this.#confirming;
  }

  setVisible(visible: boolean): void {
    this.#button.style.display = visible ? 'grid' : 'none';
    if (!visible) this.#close();
  }

  dispose(): void {
    this.#button.remove();
    this.#confirm.remove();
  }
}
