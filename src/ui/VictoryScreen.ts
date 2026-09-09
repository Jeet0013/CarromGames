/**
 * End-of-match result.
 *
 * A match that simply stops is indistinguishable from a bug — the player needs
 * to be told the game ended, who won, and how to start another.
 *
 * Built from the same plate and the same mark as the menu, so the end of a
 * match lands in the same room the match started in. It was floating text and
 * two pills on a wash before — the only screen in the flow with no plate under
 * it, which made the game appear to end somewhere else.
 */

import { ScreenGate } from './ScreenGate';
import { brandMark, injectScreenSheet, injectSheet } from './theme';

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
  /**
   * Ignores the click left behind by the tap that opened this screen.
   *
   * The result appears the instant a shot resolves, which can be while the
   * player's finger is still coming off the board — and "Play again" sits in
   * the middle of the screen.
   */
  readonly #gate = new ScreenGate();
  #visible = false;

  constructor(container: HTMLElement, onPlayAgain: () => void, onMenu: () => void) {
    injectScreenSheet();
    injectSheet('victory', VICTORY_CSS);

    this.#root = document.createElement('div');
    this.#root.className = 'cx-screen cx-victory';

    const panel = document.createElement('div');
    panel.className = 'cx-screen-panel cx-plate cx-victory-panel';

    const head = document.createElement('header');
    head.className = 'cx-screen-head';
    head.append(brandMark('sm'));

    this.#headline = document.createElement('h2');
    this.#headline.className = 'cx-victory-headline';

    this.#subtitle = document.createElement('p');
    this.#subtitle.className = 'cx-victory-subtitle';

    const rule = document.createElement('hr');
    rule.className = 'cx-rule cx-victory-rule';

    head.append(this.#headline, this.#subtitle, rule);

    const actions = document.createElement('div');
    actions.className = 'cx-victory-actions';

    const again = this.#button('Play again', true);
    again.addEventListener('click', (event) => {
      event.stopPropagation();
      if (this.#gate.blocked(event)) return;
      onPlayAgain();
    });

    const menu = this.#button('Main menu', false);
    menu.addEventListener('click', (event) => {
      event.stopPropagation();
      if (this.#gate.blocked(event)) return;
      onMenu();
    });

    actions.append(again, menu);
    panel.append(head, actions);

    this.#root.append(panel);
    container.append(this.#root);
  }

  #button(label: string, primary: boolean): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.className = primary
      ? 'cx-btn cx-btn--primary cx-focus'
      : 'cx-btn cx-btn--quiet cx-focus';
    return button;
  }

  show(details: VictoryDetails): void {
    this.#visible = true;
    this.#gate.open();
    this.#headline.textContent = details.headline;
    // Win and loss are told apart before the words are read — the winning
    // headline is struck in the same gold as the mark above it, the losing one
    // is not. One state is lit; the other simply is not.
    this.#headline.classList.toggle('is-win', details.playerWon);
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

const VICTORY_CSS = `
/* Above the menu: a result must not be reachable past. */
.cx-victory { z-index: 80; backdrop-filter: blur(5px); }

.cx-victory-panel { text-align: center; }

.cx-victory-headline {
  margin: 0;
  font: 700 clamp(21px, 5.6vw, 30px) / 1.15 system-ui, -apple-system, sans-serif;
  letter-spacing: -0.01em;
  color: #cdbfab;
  text-wrap: balance;
}

.cx-victory-headline.is-win {
  background: linear-gradient(179deg, #fffdf2 2%, #ffe9a4 19%, #f3c64f 41%, #bd8722 53%, #f4d275 69%, #fff7db 94%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  filter: drop-shadow(0 0 22px rgba(232, 163, 61, 0.4));
}

.cx-victory-subtitle {
  margin: 0;
  font: 400 clamp(13px, 3.4vw, 14px) / 1.5 system-ui, -apple-system, sans-serif;
  color: #a2937f;
  text-wrap: pretty;
}

.cx-victory-rule { width: 100%; }

.cx-victory-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  justify-content: center;
  padding: clamp(14px, 3vh, 22px) clamp(20px, 5vw, 30px) 0;
}

`;
