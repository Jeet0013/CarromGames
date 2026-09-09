/**
 * Reopens the controls tutorial.
 *
 * Sits beside the sound toggle. Small, but it is the difference between a
 * tutorial a player skipped by accident and one they can never see again.
 */

import { injectBaseSheet } from './theme';

export class HelpButton {
  readonly #button: HTMLButtonElement;

  constructor(container: HTMLElement, onClick: () => void) {
    this.#button = document.createElement('button');
    this.#button.type = 'button';
    this.#button.textContent = '?';
    this.#button.setAttribute('aria-label', 'How to play');
    injectBaseSheet();
    this.#button.className = 'cx-icon-btn cx-focus';
    this.#button.style.cssText = [
      'position:absolute',
      'top:max(14px, env(safe-area-inset-top))',
      // Left of the sound toggle, which owns the corner itself.
      'right:calc(max(14px, env(safe-area-inset-right)) + 54px)',
      'font:600 18px/1 system-ui, -apple-system, sans-serif',
      'z-index:40',
    ].join(';');

    this.#button.addEventListener('click', (event) => {
      // The canvas is underneath; without this the tap also aims a shot.
      event.stopPropagation();
      onClick();
    });
    container.append(this.#button);
  }

  /** Hidden while a full-screen overlay is up, so it cannot sit over a menu. */
  setVisible(visible: boolean): void {
    this.#button.style.display = visible ? 'grid' : 'none';
  }

  dispose(): void {
    this.#button.remove();
  }
}
