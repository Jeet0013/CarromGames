/**
 * The powder can.
 *
 * Powdering the board is something players actually do between shots, so it is
 * a deliberate action rather than an automatic effect. The button shows how
 * much powder is still on the board as a draining ring, which is what turns it
 * from a toggle into a decision about *when* to use it.
 */

export class PowderCan {
  readonly #button: HTMLButtonElement;
  readonly #fill: HTMLElement;

  constructor(container: HTMLElement, onUse: () => void) {
    this.#button = document.createElement('button');
    this.#button.type = 'button';
    this.#button.setAttribute('aria-label', 'Powder the board');
    this.#button.style.cssText = [
      'position:absolute',
      'top:max(14px, env(safe-area-inset-top))',
      // Third in the corner stack, left of help and sound.
      'right:calc(max(14px, env(safe-area-inset-right)) + 108px)',
      'width:46px',
      'height:46px',
      'border-radius:50%',
      'border:1px solid rgba(176,122,69,0.45)',
      'background:rgba(18,16,14,0.8)',
      'cursor:pointer',
      'display:grid',
      'place-items:center',
      'padding:0',
      'overflow:hidden',
      'z-index:40',
      '-webkit-tap-highlight-color:transparent',
    ].join(';');

    // A draining ring behind the icon shows the powder wearing off.
    this.#fill = document.createElement('span');
    this.#fill.style.cssText = [
      'position:absolute',
      'inset:0',
      'border-radius:50%',
      'background:conic-gradient(rgba(255,246,230,0.32) 0deg, transparent 0deg)',
      'pointer-events:none',
      'transition:background 200ms linear',
    ].join(';');

    // Simple can glyph, drawn rather than an emoji so it matches the UI's tone.
    const icon = document.createElement('span');
    icon.innerHTML = `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <rect x="7" y="8" width="10" height="12" rx="2" fill="none" stroke="#f4ece1" stroke-width="1.6"/>
      <path d="M9.5 8V6.5a2.5 2.5 0 0 1 5 0V8" fill="none" stroke="#f4ece1" stroke-width="1.6"/>
      <circle cx="10" cy="4" r="1" fill="#fff6e6"/>
      <circle cx="14.5" cy="3" r="0.8" fill="#fff6e6"/>
      <circle cx="12.5" cy="5.2" r="0.6" fill="#fff6e6"/>
    </svg>`;
    icon.style.cssText = 'position:relative;line-height:0';

    this.#button.append(this.#fill, icon);
    this.#button.addEventListener('click', (event) => {
      // The canvas is underneath; without this the tap also aims a shot.
      event.stopPropagation();
      onUse();
    });
    container.append(this.#button);
  }

  /** @param level 0–1 powder remaining. */
  setLevel(level: number): void {
    const degrees = Math.round(level * 360);
    this.#fill.style.background = `conic-gradient(rgba(255,246,230,0.32) ${degrees}deg, transparent ${degrees}deg)`;
    this.#button.style.borderColor =
      level > 0.02 ? 'rgba(255,246,230,0.6)' : 'rgba(176,122,69,0.45)';
  }

  /** Hidden while a full-screen overlay is up, so it cannot sit over a menu. */
  setVisible(visible: boolean): void {
    this.#button.style.display = visible ? 'grid' : 'none';
  }

  dispose(): void {
    this.#button.remove();
  }
}
