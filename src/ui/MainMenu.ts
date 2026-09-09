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

import logoArt from '../assets/logo.png';
import { GameMode } from '../core/types';
import { ScreenGate } from './ScreenGate';
import { COLORS, LAYER, MONO_FONT, TEXT_FONT, injectBaseSheet, injectSheet } from './theme';

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

    injectBaseSheet();
    injectSheet('menu', MENU_CSS);

    this.#root = document.createElement('div');
    this.#root.className = 'cx-menu';

    const content = document.createElement('div');
    content.className = 'cx-menu-content cx-plate';
    content.append(this.#buildHeader(), this.#buildList());

    this.#root.append(content);
    container.append(this.#root);
  }

  #buildHeader(): HTMLElement {
    const header = document.createElement('header');
    header.className = 'cx-menu-header';

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

    const logo = document.createElement('img');
    logo.src = logoArt;
    logo.alt = 'Carrom Arena';
    logo.width = 560;
    logo.height = 280;
    logo.className = 'cx-menu-logo';

    title.append(logo);

    // A struck rule under the name instead of a second all-caps line. The old
    // "CHOOSE A GAME" said nothing the five rows below it did not already say.
    const rule = document.createElement('hr');
    rule.className = 'cx-rule cx-menu-headrule';

    header.append(title, rule);
    return header;
  }

  #buildList(): HTMLElement {
    // A menu is a list. Saying so gives a screen reader the count for free.
    const list = document.createElement('ul');
    list.className = 'cx-menu-list';

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
    row.className = 'cx-menu-row cx-focus';
    row.disabled = locked;

    const mark = document.createElement('span');
    mark.className = 'cx-menu-mark';
    mark.setAttribute('aria-hidden', 'true');
    mark.innerHTML = `<svg viewBox="0 0 24 24">${MARKS[option.icon]}</svg>`;

    const text = document.createElement('span');
    text.className = 'cx-menu-text';

    const title = document.createElement('span');
    title.className = 'cx-menu-name';
    title.textContent = option.title;

    const blurb = document.createElement('span');
    blurb.className = 'cx-menu-blurb';
    blurb.textContent = locked ? `${option.blurb} ${option.lockedReason}` : option.blurb;

    text.append(title, blurb);

    // Right-aligned and tabular, so the counts form a column the eye can run
    // down rather than five labels of five different widths.
    const tag = document.createElement('span');
    tag.className = 'cx-menu-tag';
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
.cx-menu {
  position: absolute;
  inset: 0;
  display: none;
  flex-direction: column;
  align-items: center;
  /* Never center: a tall list on a short screen must scroll from the top
     rather than have its head cut off. */
  justify-content: flex-start;
  padding: max(20px, env(safe-area-inset-top)) 20px max(24px, env(safe-area-inset-bottom));
  /* The board is behind this; a warm wash keeps it faintly visible so the menu
     reads as sitting on the table rather than replacing it. */
  background: radial-gradient(ellipse at 50% 42%, rgba(26, 20, 15, 0.8), rgba(9, 8, 7, 0.95) 74%);
  backdrop-filter: blur(3px);
  z-index: ${LAYER.screen};
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

.cx-menu-content {
  width: min(470px, 100%);
  /* Centres when it fits, scrolls from the top when it does not. */
  margin: auto 0;
  padding: clamp(20px, 4vh, 32px) 0 clamp(10px, 2vh, 16px);
}

.cx-menu-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: clamp(12px, 2.4vh, 20px);
  padding: 0 clamp(20px, 5vw, 30px);
}

.cx-menu-title {
  margin: 0;
  line-height: 0;
}

.cx-menu-logo {
  display: block;
  /* Big enough to read as the game's mark, small enough that the five modes
     below it are still the reason the screen exists. */
  width: clamp(190px, 46vw, 270px);
  height: auto;
  /* The mark is drawn lit from above; this is its shadow on the plate. */
  filter: drop-shadow(0 6px 14px rgba(0, 0, 0, 0.6));
}

.cx-menu-headrule { width: 100%; }

.cx-menu-list {
  list-style: none;
  margin: clamp(6px, 1.4vh, 12px) 0 0;
  padding: 0;
}

/* The rules between rows — struck, not bordered, and not above the first. */
.cx-menu-list li + li .cx-menu-row::before {
  content: "";
  position: absolute;
  top: 0;
  left: clamp(20px, 5vw, 30px);
  right: clamp(20px, 5vw, 30px);
  height: 1px;
  background: linear-gradient(90deg, transparent, ${COLORS.brassFaint} 18%, ${COLORS.brassFaint} 82%, transparent);
}

.cx-menu-row {
  position: relative;
  display: flex;
  align-items: center;
  gap: clamp(12px, 3vw, 18px);
  width: 100%;
  /* Comfortably past 44px at every step. */
  min-height: 62px;
  padding: 13px clamp(20px, 5vw, 30px);
  border: 0;
  background: transparent;
  color: ${COLORS.ink};
  text-align: left;
  font: inherit;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: background-color 180ms ease, transform 120ms ease;
}

.cx-menu-row:disabled {
  cursor: not-allowed;
  opacity: 0.4;
}

/*
 * Hover on devices that have one.
 *
 * 'any-hover' rather than a JS pointerenter listener: on a touchscreen that
 * listener fires on tap and leaves the row stuck in its hover state until
 * something else is touched.
 */
@media (any-hover: hover) {
  .cx-menu-row:not(:disabled):hover {
    background-color: rgba(201, 152, 47, 0.07);
  }
  .cx-menu-row:not(:disabled):hover .cx-menu-mark {
    color: ${COLORS.brass};
    transform: scale(1.06);
  }
  .cx-menu-row:not(:disabled):hover .cx-menu-name {
    color: #ffeec2;
  }
}

/* Press feedback, which there was none of. A row you push should move. */
.cx-menu-row:not(:disabled):active {
  transform: translateY(1px);
  background-color: rgba(201, 152, 47, 0.11);
}

.cx-menu-mark {
  flex: none;
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  color: ${COLORS.inkSoft};
  transition: color 180ms ease, transform 180ms ease;
}

.cx-menu-mark svg {
  width: 22px;
  height: 22px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.5;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.cx-menu-text {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.cx-menu-name {
  font: 600 clamp(15px, 3.8vw, 17px) / 1.2 ${TEXT_FONT};
  letter-spacing: 0;
  transition: color 180ms ease;
}

.cx-menu-blurb {
  font: 400 clamp(12px, 3.2vw, 13px) / 1.4 ${TEXT_FONT};
  color: ${COLORS.inkMuted};
  text-wrap: pretty;
}

.cx-menu-tag {
  flex: none;
  margin-left: auto;
  font: 500 11px / 1 ${MONO_FONT};
  /* Tabular so "1 player" and "4 players" align on the digit. */
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.1em;
  color: ${COLORS.inkMuted};
  white-space: nowrap;
}

/* Under about 380px the count and the blurb start fighting; the blurb wins. */
@media (max-width: 380px) {
  .cx-menu-tag { display: none; }
}
`;
