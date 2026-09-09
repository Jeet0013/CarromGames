/**
 * Difficulty selection, shown after choosing Play vs Computer.
 *
 * Built from the same furniture as the menu — same plate, same rows, same
 * brass rules, same mark at the top — so it reads as the next step of one
 * flow rather than a different screen. It previously *claimed* to reuse the
 * menu's language while both screens were drifting: four more accent colours
 * (green, orange, blue, purple) on top of the menu's five, and a star glyph
 * whose shape was whichever font happened to render it.
 *
 * Strength is four stars filled in the one accent. Stars because that is what
 * a difficulty scale looks like; drawn rather than typed as ★ because a
 * glyph's shape and weight belong to whichever font renders it, and this ships
 * to platforms that disagree.
 */

import { AIDifficulty, DIFFICULTY_INFO, DIFFICULTY_ORDER } from '../ai/AIDifficulty';
import { ScreenGate } from './ScreenGate';
import { brandMark, injectScreenSheet, injectSheet, starMark } from './theme';

/** How many stars a level shows. Four, so the scale reads at a glance. */
const STAR_COUNT = 4;

export class DifficultySelect {
  readonly #root: HTMLElement;
  /** Ignores the click left behind by the tap that opened this screen. */
  readonly #gate = new ScreenGate();
  #visible = false;

  constructor(
    container: HTMLElement,
    onSelect: (difficulty: AIDifficulty) => void,
    onBack: () => void,
  ) {
    injectScreenSheet();
    injectSheet('difficulty', DIFFICULTY_CSS);

    this.#root = document.createElement('div');
    this.#root.className = 'cx-screen';

    const panel = document.createElement('div');
    panel.className = 'cx-screen-panel cx-plate';

    const head = document.createElement('header');
    head.className = 'cx-screen-head';

    // Smaller than the menu's: this is a step inside the flow, not its front
    // door, and the mark at full size twice running reads as a loop.
    head.append(brandMark('sm'));

    const eyebrow = document.createElement('h2');
    eyebrow.className = 'cx-eyebrow';
    eyebrow.textContent = 'Select difficulty';

    const rule = document.createElement('hr');
    rule.className = 'cx-rule cx-difficulty-rule';

    head.append(eyebrow, rule);

    const list = document.createElement('ul');
    list.className = 'cx-list';
    for (const difficulty of DIFFICULTY_ORDER) {
      const item = document.createElement('li');
      item.append(this.#buildRow(difficulty, onSelect));
      list.append(item);
    }

    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'cx-back cx-focus';
    back.textContent = '← Back';
    back.addEventListener('click', (event) => {
      event.stopPropagation();
      if (this.#gate.blocked(event)) return;
      onBack();
    });

    panel.append(head, list, back);
    this.#root.append(panel);
    container.append(this.#root);
  }

  #buildRow(
    difficulty: AIDifficulty,
    onSelect: (difficulty: AIDifficulty) => void,
  ): HTMLElement {
    const info = DIFFICULTY_INFO[difficulty];

    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'cx-row cx-focus';

    const text = document.createElement('span');
    text.className = 'cx-row-text';

    const name = document.createElement('span');
    name.className = 'cx-row-name';
    name.textContent = info.label;

    const blurb = document.createElement('span');
    blurb.className = 'cx-row-blurb';
    blurb.textContent = info.description;

    text.append(name, blurb);

    const stars = document.createElement('span');
    stars.className = 'cx-stars';
    // The stars are a picture of the number; the number itself goes to anyone
    // who cannot see them.
    stars.setAttribute('role', 'img');
    stars.setAttribute('aria-label', `Strength ${info.stars} of ${STAR_COUNT}`);
    for (let i = 0; i < STAR_COUNT; i += 1) stars.append(starMark(i < info.stars));

    row.append(text, stars);

    row.addEventListener('click', (event) => {
      event.stopPropagation();
      if (this.#gate.blocked(event)) return;
      onSelect(difficulty);
    });

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

  dispose(): void {
    this.#root.remove();
  }
}

const DIFFICULTY_CSS = `
.cx-difficulty-rule { width: 100%; }

/* No mark on these rows, so the text starts where the menu's text starts. */
.cx-screen-panel .cx-list .cx-row > .cx-row-text:first-child {
  padding-left: 2px;
}
`;
