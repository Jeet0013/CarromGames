/**
 * End-of-match result.
 *
 * A match that simply stops is indistinguishable from a bug — the player needs
 * to be told the game ended, who won, and how to start another. Reuses the
 * menu's card language so it reads as part of the same game.
 */

export interface VictoryDetails {
  readonly headline: string;
  readonly subtitle: string;
  /** True when the human won, which changes the accent and the tone. */
  readonly playerWon: boolean;
}

export class VictoryScreen {
  readonly #root: HTMLElement;
  readonly #headline: HTMLElement;
  readonly #subtitle: HTMLElement;
  #visible = false;

  constructor(container: HTMLElement, onPlayAgain: () => void, onMenu: () => void) {
    this.#root = document.createElement('div');
    this.#root.style.cssText = [
      'position:absolute',
      'inset:0',
      'display:none',
      'flex-direction:column',
      'align-items:center',
      'justify-content:center',
      'gap:16px',
      'padding:24px',
      'background:radial-gradient(ellipse at 50% 45%, rgba(30,24,18,0.9), rgba(9,8,7,0.97) 70%)',
      'backdrop-filter:blur(5px)',
      'z-index:80',
    ].join(';');

    this.#headline = document.createElement('h2');
    this.#headline.style.cssText = [
      'margin:0',
      'font:700 clamp(30px, 8vw, 52px)/1.05 system-ui, -apple-system, sans-serif',
      'letter-spacing:0.01em',
      'text-align:center',
    ].join(';');

    this.#subtitle = document.createElement('p');
    this.#subtitle.style.cssText = [
      'margin:0',
      'font:400 14px/1.5 system-ui, -apple-system, sans-serif',
      'color:#9a8d7d',
      'text-align:center',
      'max-width:34ch',
    ].join(';');

    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;gap:10px;flex-wrap:wrap;justify-content:center';

    const again = this.#button('Play again', true);
    again.addEventListener('click', (e) => {
      e.stopPropagation();
      this.hide();
      onPlayAgain();
    });

    const menu = this.#button('Main menu', false);
    menu.addEventListener('click', (e) => {
      e.stopPropagation();
      this.hide();
      onMenu();
    });

    actions.append(again, menu);
    this.#root.append(this.#headline, this.#subtitle, actions);
    container.append(this.#root);
  }

  #button(label: string, primary: boolean): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.style.cssText = [
      'padding:15px 26px',
      'border-radius:999px',
      primary ? 'border:1px solid rgba(176,122,69,0.55)' : 'border:1px solid rgba(176,122,69,0.32)',
      primary
        ? 'background:linear-gradient(170deg, #e8a33d, #b07a45)'
        : 'background:transparent',
      primary ? 'color:#1a140e' : 'color:#c9bdae',
      'font:700 13.5px/1 system-ui, -apple-system, sans-serif',
      'letter-spacing:0.08em',
      'text-transform:uppercase',
      'cursor:pointer',
      '-webkit-tap-highlight-color:transparent',
    ].join(';');
    return button;
  }

  show(details: VictoryDetails): void {
    this.#visible = true;
    this.#headline.textContent = details.headline;
    // Win and loss get different colour, not just different words — the result
    // should be readable before the text is.
    this.#headline.style.color = details.playerWon ? '#f7e7cf' : '#c9bdae';
    this.#headline.style.textShadow = details.playerWon
      ? '0 0 28px rgba(232,163,61,0.45)'
      : 'none';
    this.#subtitle.textContent = details.subtitle;
    this.#root.style.display = 'flex';
  }

  get visible(): boolean {
    return this.#visible;
  }

  hide(): void {
    this.#visible = false;
    this.#root.style.display = 'none';
  }

  dispose(): void {
    this.#root.remove();
  }
}
