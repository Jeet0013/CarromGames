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

import { CoinColor } from '../core/types';
import { ScreenGate } from './ScreenGate';
import { brandMark, injectScreenSheet, injectSheet } from './theme';

/** One player's final line on the scoreboard. */
export interface ScoreRow {
  readonly name: string;
  /** Null when this player never pocketed a coin and so never claimed. */
  readonly color: CoinColor | null;
  readonly potted: number;
  readonly total: number;
  readonly hasQueen: boolean;
  readonly isWinner: boolean;
}

export interface VictoryDetails {
  readonly headline: string;
  readonly subtitle: string;
  /** True when the human won, which changes the accent and the tone. */
  readonly playerWon: boolean;
  /**
   * The final board, per player.
   *
   * The result used to be a headline and one sentence, which said who won and
   * nothing about how. A player who has just lost a close match wants the
   * count, and a player who took the Queen wants to see that it counted.
   */
  readonly rows: readonly ScoreRow[];
}

export class VictoryScreen {
  readonly #root: HTMLElement;
  readonly #headline: HTMLElement;
  readonly #subtitle: HTMLElement;
  readonly #board: HTMLElement;
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

    this.#board = document.createElement('ul');
    this.#board.className = 'cx-list cx-victory-board';

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
    panel.append(head, this.#board, actions);

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

  /** One scoreboard line: who, which colour, how many, and the Queen. */
  #buildRow(row: ScoreRow): HTMLElement {
    const item = document.createElement('li');

    const line = document.createElement('div');
    line.className = row.isWinner ? 'cx-row cx-score is-winner' : 'cx-row cx-score';

    const swatch = document.createElement('span');
    swatch.className = 'cx-score-swatch';
    if (row.color === null) {
      swatch.classList.add('is-unclaimed');
    } else {
      swatch.style.background =
        row.color === CoinColor.White
          ? 'radial-gradient(circle at 36% 30%, #ffffff, #d9cdb8)'
          : 'radial-gradient(circle at 36% 30%, #4a423a, #14110e)';
    }

    const text = document.createElement('span');
    text.className = 'cx-row-text';

    const name = document.createElement('span');
    name.className = 'cx-row-name';
    name.textContent = row.name;

    const colour = document.createElement('span');
    colour.className = 'cx-row-blurb';
    colour.textContent =
      row.color === null
        ? 'No colour claimed'
        : row.color === CoinColor.White
          ? 'White'
          : 'Black';

    text.append(name, colour);

    const tally = document.createElement('span');
    tally.className = 'cx-score-tally';
    // Potted over total, so a 7 reads as "two short" rather than just "7".
    tally.textContent = `${row.potted}/${row.total}`;

    line.append(swatch, text, tally);

    if (row.hasQueen) {
      const queen = document.createElement('span');
      queen.className = 'cx-score-queen';
      queen.textContent = 'Q';
      queen.title = 'Took the Queen';
      queen.setAttribute('aria-label', 'Took the Queen');
      line.append(queen);
    }

    item.append(line);
    return item;
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

    this.#board.replaceChildren();
    for (const row of details.rows) this.#board.append(this.#buildRow(row));

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
.cx-victory-board { margin-top: clamp(10px, 2vh, 16px); }

/* Not a button: the scoreboard is read, not pressed. */
.cx-score { cursor: default; min-height: 54px; }
.cx-score:active { transform: none; background-color: transparent; }

/* The winner's line is lit; the other simply is not. */
.cx-score.is-winner { background-color: rgba(201, 152, 47, 0.08); }
.cx-score.is-winner .cx-row-name { color: #ffeec2; }

.cx-score-swatch {
  flex: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.35), 0 0 0 1px rgba(0, 0, 0, 0.5);
}

.cx-score-swatch.is-unclaimed {
  background: transparent;
  box-shadow: inset 0 0 0 1px rgba(201, 152, 47, 0.35);
}

.cx-score-tally {
  flex: none;
  margin-left: auto;
  font: 600 15px / 1 ui-monospace, SFMono-Regular, Menlo, monospace;
  /* Tabular, so 7/9 and 10/9 line up on the slash. */
  font-variant-numeric: tabular-nums;
  color: #cdbfab;
}

.cx-score-queen {
  flex: none;
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  margin-left: 8px;
  border-radius: 50%;
  background: linear-gradient(160deg, #d8483c, #8e1f18);
  color: #ffe9c9;
  font: 700 11px / 1 system-ui, -apple-system, sans-serif;
  box-shadow: 0 0 10px rgba(216, 72, 60, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.3);
}

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
