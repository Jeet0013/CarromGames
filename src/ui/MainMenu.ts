/**
 * Mode selection.
 *
 * ## What changed, and why
 *
 * This was five rounded cards in a two-column auto-fit grid, each with an
 * uppercase mono label above its title and a coloured rail down its leading
 * edge — cyan, orange, purple, blue, green. Three separate problems, all of
 * them the same problem:
 *
 * - **Five accents is no accent.** Colour was carrying information the words
 *   already carried. Now there is one, brass, and it is the metal the pockets
 *   are made of.
 * - **A two-column grid of five leaves an orphan.** The fifth card sat alone
 *   on its row with dead space beside it at every width that fitted two.
 * - **An eyebrow over every title is a label nobody reads.** The player count
 *   moved to the right of the row, where it lines up in a column and can be
 *   scanned.
 *
 * It is now one plate with the modes struck into it, separated by brass rules
 * — the same object as the splash rather than a different product. Rows, not
 * cards, because a card exists to say "this is separable from that one", and
 * these are five items on one menu.
 *
 * A row can be locked. That is deliberate rather than hiding unfinished modes:
 * a player should be able to see what the game will offer, and a mode that
 * silently misbehaves is worse than one that says it is not ready.
 */

import { GameMode } from '../core/types';
import { ScreenGate } from './ScreenGate';
import { brandMark, injectScreenSheet, injectSheet } from './theme';

export interface MenuOption {
  readonly mode: GameMode;
  readonly title: string;
  /** One line explaining what the mode actually is. */
  readonly blurb: string;
  /** Short tag: player count, opponent type. */
  readonly tag: string;
  /** Which drawn mark identifies the row. */
  readonly icon: MarkName;
  /** When set, the row is unselectable and shows this reason. */
  readonly lockedReason?: string;
}

type MarkName = 'solo' | 'together' | 'four' | 'online' | 'practice';

export const MENU_OPTIONS: readonly MenuOption[] = [
  {
    mode: GameMode.QuickMatch,
    title: 'Play vs Computer',
    blurb: 'Four difficulty levels.',
    tag: '1 player',
    icon: 'solo',
  },
  {
    mode: GameMode.LocalMultiplayer,
    title: 'Two Player',
    blurb: 'Two players, one device.',
    tag: '2 players',
    icon: 'together',
  },
  {
    mode: GameMode.FourPlayer,
    title: 'Four Player',
    blurb: 'Partners with the player opposite you.',
    tag: '4 players',
    icon: 'four',
  },
  {
    mode: GameMode.Online,
    title: 'Play with a Friend',
    blurb: 'Share a link, play on two devices.',
    tag: 'Online',
    icon: 'online',
  },
  {
    mode: GameMode.Practice,
    title: 'Practice',
    blurb: 'The board to yourself.',
    tag: 'Solo',
    icon: 'practice',
  },
];

/**
 * The marks.
 *
 * Drawn here rather than pulled from an icon set, at one stroke weight, and
 * shared with the splash so the two screens are recognisably the same hand.
 */
const MARKS: Record<MarkName, string> = {
  solo: `<circle cx="12" cy="8" r="3.4"/><path d="M5.5 19.5c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/>`,
  together: `<circle cx="8.5" cy="8" r="3"/><circle cx="16.5" cy="9.5" r="2.4"/><path d="M2.5 19c0-3.2 2.7-5.4 6-5.4s6 2.2 6 5.4"/><path d="M15 14.4c2.9 0 6 1.4 6 4.6"/>`,
  four: `<circle cx="12" cy="5.4" r="2.4"/><circle cx="12" cy="18.6" r="2.4"/><circle cx="5.4" cy="12" r="2.4"/><circle cx="18.6" cy="12" r="2.4"/><path d="M12 9.4v5.2M9.4 12h5.2"/>`,
  online: `<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17"/><path d="M12 3.5c2.4 2.6 3.6 5.4 3.6 8.5S14.4 18.4 12 20.5c-2.4-2.1-3.6-5.4-3.6-8.5S9.6 6.1 12 3.5Z"/>`,
  practice: `<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.6"/><circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"/>`,
};

export class MainMenu {
  readonly #root: HTMLElement;
  readonly #onSelect: (mode: GameMode) => void;
  /** Ignores the click the splash's own tap leaves behind. */
  readonly #gate = new ScreenGate();
  #visible = false;

  constructor(container: HTMLElement, onSelect: (mode: GameMode) => void) {
    this.#onSelect = onSelect;

    injectScreenSheet();
    injectSheet('menu', MENU_CSS);

    this.#root = document.createElement('div');
    this.#root.className = 'cx-screen';

    const content = document.createElement('div');
    content.className = 'cx-screen-panel cx-plate';
    content.append(this.#buildHeader(), this.#buildList());

    this.#root.append(content);
    container.append(this.#root);
  }

  #buildHeader(): HTMLElement {
    const header = document.createElement('header');
    header.className = 'cx-screen-head';

    /*
     * The supplied logo, not a typeset name.
     *
     * It was a gradient-clipped heading approximating the mark; using the mark
     * itself means the menu and the welcome screen carry the same object
     * rather than two drawings of it. The h1 keeps the accessible name, since
     * the mark is pixels.
     */
    const title = document.createElement('h1');
    title.className = 'cx-menu-title';
    title.append(brandMark('lg'));

    // A struck rule under the mark instead of a second all-caps line. The old
    // "CHOOSE A GAME" said nothing the five rows below it did not already say.
    const rule = document.createElement('hr');
    rule.className = 'cx-rule cx-menu-headrule';

    header.append(title, rule);
    return header;
  }

  #buildList(): HTMLElement {
    // A menu is a list. Saying so gives a screen reader the count for free.
    const list = document.createElement('ul');
    list.className = 'cx-list';

    for (const option of MENU_OPTIONS) {
      const item = document.createElement('li');
      item.append(this.#buildRow(option));
      list.append(item);
    }

    return list;
  }

  #buildRow(option: MenuOption): HTMLElement {
    const locked = option.lockedReason !== undefined;

    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'cx-row cx-focus';
    row.disabled = locked;

    const mark = document.createElement('span');
    mark.className = 'cx-mark';
    mark.setAttribute('aria-hidden', 'true');
    mark.innerHTML = `<svg viewBox="0 0 24 24">${MARKS[option.icon]}</svg>`;

    const text = document.createElement('span');
    text.className = 'cx-row-text';

    const title = document.createElement('span');
    title.className = 'cx-row-name';
    title.textContent = option.title;

    const blurb = document.createElement('span');
    blurb.className = 'cx-row-blurb';
    blurb.textContent = locked ? `${option.blurb} ${option.lockedReason}` : option.blurb;

    text.append(title, blurb);

    // Right-aligned and tabular, so the counts form a column the eye can run
    // down rather than five labels of five different widths.
    const tag = document.createElement('span');
    tag.className = 'cx-row-meta';
    tag.textContent = option.tag;

    row.append(mark, text, tag);

    if (!locked) {
      row.addEventListener('click', (event) => {
        // The canvas listens for pointer events beneath this overlay.
        event.stopPropagation();
        // A tap that opened this menu must not also choose from it.
        if (this.#gate.blocked(event)) return;
        this.#onSelect(option.mode);
      });
    }

    return row;
  }

  get visible(): boolean {
    return this.#visible;
  }

  show(): void {
    this.#visible = true;
    this.#gate.open();
    this.#root.style.display = 'flex';
  }

  hide(): void {
    this.#visible = false;
    this.#root.style.display = 'none';
  }

  /** Unlock a mode once its system exists — used when the AI lands. */
  setLocked(mode: GameMode, locked: boolean): void {
    const index = MENU_OPTIONS.findIndex((o) => o.mode === mode);
    if (index < 0) return;
    const row = this.#root.querySelectorAll('button')[index];
    if (row instanceof HTMLButtonElement) row.disabled = locked;
  }

  dispose(): void {
    this.#root.remove();
  }
}

const MENU_CSS = `
.cx-menu-title { margin: 0; line-height: 0; }
.cx-menu-headrule { width: 100%; }

/* Under about 380px the count and the blurb start fighting; the blurb wins. */
@media (max-width: 380px) {
  .cx-row-meta { display: none; }
}
`;
