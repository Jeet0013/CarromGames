/**
 * Reopens the controls tutorial.
 *
 * Sits beside the sound toggle. Small, but it is the difference between a
 * tutorial a player skipped by accident and one they can never see again.
 */

export class HelpButton {
  readonly #button: HTMLButtonElement;

  constructor(container: HTMLElement, onClick: () => void) {
    this.#button = document.createElement('button');
    this.#button.type = 'button';
    this.#button.textContent = '?';
    this.#button.setAttribute('aria-label', 'How to play');
    this.#button.style.cssText = [
      'position:absolute',
      'top:max(14px, env(safe-area-inset-top))',
      // Left of the sound toggle, which owns the corner itself.
      'right:calc(max(14px, env(safe-area-inset-right)) + 54px)',
      'width:46px',
      'height:46px',
      'border-radius:50%',
      'border:1px solid rgba(176,122,69,0.45)',
      'background:rgba(18,16,14,0.8)',
      'color:#f4ece1',
      'font:600 18px/1 system-ui, -apple-system, sans-serif',
      'cursor:pointer',
      'display:grid',
      'place-items:center',
      'z-index:40',
      '-webkit-tap-highlight-color:transparent',
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
