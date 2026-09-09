/**
 * First-run coaching.
 *
 * Carrom's rules are widely known; its *controls* are not, and nothing on
 * screen explains that you drag away from the striker to shoot toward it. That
 * one inversion is the thing a new player gets wrong, so it is what this
 * teaches — three steps, in the order they are performed.
 *
 * Shown once, then remembered. It can be reopened from the help button, because
 * a tutorial you cannot get back is a tutorial you resent missing.
 *
 * The steps are genuinely sequential — place, aim, release — so they are
 * numbered. The diagrams are inline SVG rather than text, since "pull backwards
 * to shoot forwards" is far clearer shown than described.
 */

import { ScreenGate } from './ScreenGate';
import { brandMark, injectScreenSheet, injectSheet } from './theme';

const STEPS: ReadonlyArray<{
  readonly title: string;
  readonly body: string;
  readonly art: string;
}> = [
  {
    title: 'Place your striker',
    body: 'Drag the white striker left and right along the line on your side of the board.',
    // Striker on a baseline with movement arrows.
    art: `<line x1="14" y1="46" x2="86" y2="46" stroke="currentColor" stroke-width="1.5" opacity="0.45"/>
          <circle cx="50" cy="46" r="9" fill="#f2ece0" stroke="#b07a45" stroke-width="1.5"/>
          <path d="M30 46 h-9 m0 0 l4 -4 m-4 4 l4 4" stroke="#e8a33d" stroke-width="2" fill="none" stroke-linecap="round"/>
          <path d="M70 46 h9 m0 0 l-4 -4 m4 4 l-4 4" stroke="#e8a33d" stroke-width="2" fill="none" stroke-linecap="round"/>`,
  },
  {
    title: 'Pull back to aim',
    body: 'Press the board behind the striker and drag away from it. The further you pull, the more power.',
    // Finger pulling back, dashed pull line, aim arrow the opposite way.
    art: `<circle cx="50" cy="34" r="9" fill="#f2ece0" stroke="#b07a45" stroke-width="1.5"/>
          <line x1="50" y1="43" x2="50" y2="74" stroke="#8fbfff" stroke-width="2" stroke-dasharray="4 3" stroke-linecap="round"/>
          <circle cx="50" cy="76" r="5" fill="#8fbfff" opacity="0.75"/>
          <path d="M50 25 v-12 m0 0 l-4 5 m4 -5 l4 5" stroke="#e8a33d" stroke-width="2.2" fill="none" stroke-linecap="round"/>`,
  },
  {
    title: 'Release to shoot',
    body: 'Let go and the striker fires the opposite way — into the coins. Pocket your colour to keep your turn.',
    // Striker travelling up into scattering coins.
    art: `<circle cx="50" cy="66" r="9" fill="#f2ece0" stroke="#b07a45" stroke-width="1.5"/>
          <path d="M50 54 v-13" stroke="#e8a33d" stroke-width="2.2" stroke-linecap="round"/>
          <path d="M50 36 l-4 6 m4 -6 l4 6" stroke="#e8a33d" stroke-width="2.2" fill="none" stroke-linecap="round"/>
          <circle cx="38" cy="26" r="6" fill="#2a1c12" stroke="#b07a45" stroke-width="1"/>
          <circle cx="52" cy="20" r="6" fill="#e8d9bd" stroke="#b07a45" stroke-width="1"/>
          <circle cx="64" cy="28" r="6" fill="#9b1f18" stroke="#b07a45" stroke-width="1"/>`,
  },
];

export class Tutorial {
  readonly #root: HTMLElement;
  readonly #onDismiss: () => void;
  /**
   * Ignores the click left behind by the tap that opened this screen.
   *
   * This one mattered most: choosing a mode opens the tutorial, so a single
   * tap on the splash could cascade all the way through — start the game,
   * pick a mode, and land the player on "How to play" having chosen nothing.
   */
  readonly #gate = new ScreenGate();
  #visible = false;

  constructor(container: HTMLElement, onDismiss: () => void) {
    this.#onDismiss = onDismiss;

    injectScreenSheet();
    injectSheet('tutorial', TUTORIAL_CSS);

    this.#root = document.createElement('div');
    this.#root.className = 'cx-tutorial';

    /*
     * The content scrolls; the action bar does not.
     *
     * On a phone the three steps plus the rules run well past one screen, so a
     * button placed after them sits below the fold — a player has to discover
     * they can scroll before they can start. Pinning it means the way forward
     * is always visible, and the padding below the content lets the last line
     * clear the bar instead of hiding under it.
     */
    const scroll = document.createElement('div');
    scroll.className = 'cx-tutorial-scroll';

    const panel = document.createElement('div');
    panel.className = 'cx-screen-panel cx-plate cx-tutorial-panel';

    const head = document.createElement('header');
    head.className = 'cx-screen-head';
    head.append(brandMark('sm'));

    const heading = document.createElement('h2');
    heading.className = 'cx-eyebrow';
    heading.textContent = 'How to play';

    const headRule = document.createElement('hr');
    headRule.className = 'cx-rule cx-tutorial-rule';
    head.append(heading, headRule);

    /*
     * The steps are a list, not three cards side by side.
     *
     * Three equal columns is the layout this screen had and the one thing a
     * player cannot do with it is read it in order — at phone width they
     * stacked anyway, and at desktop width the eye had no reason to start on
     * the left. Numbered rows are ordered by construction.
     */
    const steps = document.createElement('ol');
    steps.className = 'cx-list cx-tutorial-steps';
    STEPS.forEach((step, index) => {
      const item = document.createElement('li');
      item.append(this.#buildStep(step, index + 1));
      steps.append(item);
    });

    // ── Rules ─────────────────────────────────────────────────────────────
    // Controls alone are not enough: a player who does not know the win
    // condition has no way to tell whether they are doing well.
    const rules = document.createElement('section');
    rules.className = 'cx-tutorial-rules';

    const rulesTitle = document.createElement('h3');
    rulesTitle.textContent = 'How to win';
    rulesTitle.className = 'cx-eyebrow cx-tutorial-ruleshead';

    const list = document.createElement('ul');
    list.className = 'cx-tutorial-ruleslist';

    for (const rule of [
      'The first coin you pocket claims that colour — light or dark. The other colour becomes your opponent\u2019s.',
      'Pocket one of your own coins and you shoot again. Miss, and the turn passes.',
      'Pocket the red Queen and you must cover her by pocketing one of your own coins on the next shot, or she goes back to the centre.',
      'Pocket the striker and it is a foul: your turn ends and one of your coins returns to the board.',
      'Win by pocketing all nine of your colour — with the Queen covered.',
    ]) {
      const item = document.createElement('li');
      item.textContent = rule;
      list.append(item);
    }

    rules.append(rulesTitle, list);

    const done = document.createElement('button');
    done.type = 'button';
    done.textContent = 'Got it';
    done.className = 'cx-btn cx-btn--primary cx-focus';
    done.addEventListener('click', (event) => {
      event.stopPropagation();
      if (this.#gate.blocked(event)) return;
      this.hide();
      this.#onDismiss();
    });

    panel.append(head, steps, rules);
    scroll.append(panel);

    const footer = document.createElement('div');
    footer.className = 'cx-tutorial-footer';
    done.style.pointerEvents = 'auto';
    footer.append(done);

    this.#root.append(scroll, footer);
    container.append(this.#root);
  }

  #buildStep(
    step: { title: string; body: string; art: string },
    number: number,
  ): HTMLElement {
    const row = document.createElement('div');
    row.className = 'cx-row cx-tutorial-step';

    const art = document.createElement('span');
    art.className = 'cx-tutorial-art';
    art.innerHTML = `<svg viewBox="0 0 100 92" aria-hidden="true">${step.art}</svg>`;

    const text = document.createElement('span');
    text.className = 'cx-row-text';

    const title = document.createElement('span');
    title.className = 'cx-row-name';
    title.textContent = step.title;

    const body = document.createElement('span');
    body.className = 'cx-row-blurb';
    body.textContent = step.body;

    text.append(title, body);

    const index = document.createElement('span');
    index.className = 'cx-row-meta';
    index.textContent = `Step ${number}`;

    row.append(art, text, index);
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

const TUTORIAL_CSS = `
.cx-tutorial {
  position: absolute;
  inset: 0;
  display: none;
  flex-direction: column;
  background: radial-gradient(ellipse at 50% 42%, rgba(26, 20, 15, 0.86), rgba(9, 8, 7, 0.96) 74%);
  backdrop-filter: blur(4px);
  /* Above the menu it was opened from, below a result. */
  z-index: 70;
}

/*
 * The content scrolls; the action bar does not.
 *
 * On a phone the three steps plus the rules run past one screen, so a button
 * placed after them sits below the fold — a player has to discover they can
 * scroll before they can start. The padding below lets the last line clear
 * the bar instead of hiding under it.
 */
.cx-tutorial-scroll {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: max(18px, env(safe-area-inset-top)) 18px 104px;
}

.cx-tutorial-panel { width: min(520px, 100%); }
.cx-tutorial-rule { width: 100%; }

.cx-tutorial-steps { counter-reset: step; }

/* Not a button: nothing here is pressable, so nothing should invite a press. */
.cx-tutorial-step { cursor: default; }
.cx-tutorial-step:active { transform: none; background-color: transparent; }

.cx-tutorial-art {
  flex: none;
  display: grid;
  place-items: center;
  width: 54px;
  height: 54px;
  color: #c9982f;
  line-height: 0;
}

.cx-tutorial-art svg { width: 54px; height: 50px; }

.cx-tutorial-rules {
  margin: clamp(10px, 2vh, 16px) clamp(20px, 5vw, 30px) 0;
  padding: 14px 0 4px;
  border-top: 1px solid rgba(201, 152, 47, 0.13);
}

.cx-tutorial-ruleshead { text-align: left; margin-bottom: 10px; }

.cx-tutorial-ruleslist {
  margin: 0;
  padding-left: 17px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  font: 400 clamp(12.5px, 3.2vw, 13.5px) / 1.55 system-ui, -apple-system, sans-serif;
  color: #cdbfab;
  text-wrap: pretty;
}

.cx-tutorial-ruleslist::marker { color: #c9982f; }

.cx-tutorial-footer {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  justify-content: center;
  padding: 14px 18px max(16px, env(safe-area-inset-bottom));
  /* Fades rather than cuts, so content is visibly continuing underneath. */
  background: linear-gradient(to top, rgba(10, 9, 8, 0.97) 55%, rgba(10, 9, 8, 0));
  pointer-events: none;
}
`;
