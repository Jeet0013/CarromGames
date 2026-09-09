/**
 * Tap-to-start splash.
 *
 * Every browser refuses to start audio before the user has interacted with the
 * page — there is no flag or setting that changes this, and there should not
 * be. So the question is not whether a first tap is needed, but what it lands
 * on.
 *
 * Without this screen the first tap was a menu card: it unlocked audio and
 * immediately navigated away, so the theme began at the same instant the menu
 * left. Giving the gesture a screen of its own means the player taps once,
 * deliberately, and then the music is simply playing for the whole time they
 * are choosing — which is what "automatic" actually feels like.
 *
 * ## The look
 *
 * Built to a supplied reference: a gold crowned wordmark over a plaque, corner
 * taglines, and a row naming what is inside. Two things in that reference are
 * deliberately absent here — a CHALLENGE entry and a CUSTOMIZE entry — because
 * this game has neither, and a splash screen advertising modes that do not
 * exist is the first promise it breaks. The row names the four modes that are
 * actually behind it.
 *
 * The gold is CSS, not an image: a clipped gradient with a stack of offset
 * shadows standing in for the bevel. That keeps the splash sharp at every
 * density and adds nothing to a build that is already one 3.5 MB file, and it
 * lets the live 3D board keep showing through behind it.
 */

import { GAME_CONFIG } from '../config/GameConfig';

/**
 * How long the invisible shield stays up after the tap.
 *
 * Only a fallback: the shield normally comes down the moment it swallows the
 * click. This bounds the wait for the browsers that never send one.
 */
const SHIELD_MS = 450;

/**
 * The four modes named along the bottom.
 *
 * These are signposts, not controls: `pointer-events` is off for the whole
 * row, so a tap anywhere on this screen is the same tap. That is not a
 * shortcut being withheld — it is the tap-through fault this screen was built
 * to fix. Live buttons sitting where the menu's cards are about to appear is
 * precisely the arrangement that sent a single Android tap three screens deep.
 */
const MODES = [
  { label: 'Play Solo', icon: 'solo' },
  { label: 'Play Together', icon: 'together' },
  { label: 'Play Online', icon: 'online' },
  { label: 'Practice', icon: 'practice' },
] as const;

/** Heavy, wide, and present on every platform we ship to. */
const DISPLAY_FONT = '"Arial Black", "Arial Bold", Gadget, system-ui, sans-serif';
const MONO_FONT = 'ui-monospace, SFMono-Regular, Menlo, monospace';

/** The metal. A cool highlight, a warm body, a dark waist, a lit lower edge. */
const GOLD =
  'linear-gradient(179deg, #fffdf2 2%, #ffe9a4 19%, #f3c64f 41%, #bd8722 53%, #f4d275 69%, #fff7db 94%)';

export class SplashScreen {
  readonly #root: HTMLElement;
  #visible = false;
  #dismissed = false;
  #shieldTimer = 0;

  constructor(container: HTMLElement, onStart: () => void) {
    this.#root = document.createElement('div');
    this.#root.style.cssText = [
      'position:absolute',
      'inset:0',
      'display:none',
      'flex-direction:column',
      'align-items:center',
      'justify-content:center',
      'gap:clamp(18px, 4vh, 34px)',
      'padding:max(20px, env(safe-area-inset-top)) 24px max(20px, env(safe-area-inset-bottom))',
      // Lighter than it was. The board behind this is worth seeing now, and the
      // reference frames the wordmark against a real board rather than a wash.
      'background:radial-gradient(ellipse at 50% 46%, rgba(26,19,13,0.62), rgba(8,7,6,0.94) 78%)',
      'backdrop-filter:blur(2px)',
      'z-index:90',
      'cursor:pointer',
      '-webkit-tap-highlight-color:transparent',
    ].join(';');

    const style = document.createElement('style');
    style.textContent = SPLASH_CSS;
    document.head.append(style);

    /*
     * Which build this is.
     *
     * Deliberately visible rather than hidden in the console: the device that
     * matters is a phone at the other end of a share link, and every bug
     * report so far has had to start by establishing whether the fix being
     * discussed was even present. Small and dim enough to disappear.
     */
    const build = document.createElement('div');
    build.textContent = `Build ${GAME_CONFIG.build}`;
    build.style.cssText = [
      'position:absolute',
      'bottom:max(8px, env(safe-area-inset-bottom))',
      'left:0',
      'right:0',
      'text-align:center',
      `font:500 10px/1 ${MONO_FONT}`,
      'letter-spacing:0.1em',
      'color:#4a423a',
      'pointer-events:none',
    ].join(';');

    this.#root.append(
      buildCornerTaglines(),
      buildWordmark(),
      buildPrompt(),
      buildModeRow(),
      build,
    );

    /*
     * Pointerdown, not click: the audio unlock listens on the same event, and
     * starting both from one gesture is what makes the music arrive with the
     * menu rather than a beat behind it.
     *
     * But one tap on a touchscreen is a *sequence* — pointerdown, pointerup,
     * then a synthesised click — and the browser decides a click's target when
     * the finger lifts, by hit-testing the page as it stands at that moment.
     * Hiding this screen on pointerdown therefore handed the click to whatever
     * had just taken its place: on a phone the "Tap to start" pill sits almost
     * exactly over the mode cards, so the single tap started the game *and*
     * chose a mode, and the menu appeared to skip past.
     *
     * The fix is not to hide on pointerdown but to go transparent and stay on
     * top, so this element is still the hit-test answer when the click lands
     * and can swallow it. Then it leaves.
     */
    this.#root.addEventListener('pointerdown', (event) => {
      if (this.#dismissed) return;
      this.#dismissed = true;
      event.preventDefault();

      this.#root.style.opacity = '0';
      this.#root.style.transition = 'opacity 140ms ease';
      // Some browsers send no click at all after a prevented pointerdown, so
      // the shield cannot rely on one arriving to take itself down.
      this.#shieldTimer = window.setTimeout(() => this.hide(), SHIELD_MS);

      onStart();
    });

    /*
     * The rest of the gesture dies here rather than on the menu underneath.
     *
     * Absorbing and standing down happen in the *same* handler deliberately.
     * They were two listeners on this element, one stopping propagation and a
     * later one hiding — which only works if a stopped event still reaches the
     * other listeners on its own target. Implementations disagree about that,
     * and where it does not hold the shield never learns the tap is over and
     * sits invisibly across the menu until its timer expires. A dead half
     * second where nothing responds is exactly the fault this screen exists to
     * prevent, so nothing here depends on listener ordering.
     */
    const swallow = (event: Event): void => {
      if (!this.#dismissed) return;
      event.preventDefault();
      event.stopPropagation();
      // The click is the last event of a tap. Once it has been absorbed the
      // shield has done its job and must get out of the way.
      if (event.type === 'click') this.hide();
    };
    for (const type of ['pointerup', 'mousedown', 'mouseup', 'touchend', 'click']) {
      this.#root.addEventListener(type, swallow, { capture: true });
    }

    container.append(this.#root);
  }

  get visible(): boolean {
    return this.#visible;
  }

  show(): void {
    this.#visible = true;
    this.#dismissed = false;
    this.#root.style.opacity = '1';
    this.#root.style.display = 'flex';
  }

  hide(): void {
    window.clearTimeout(this.#shieldTimer);
    this.#shieldTimer = 0;
    this.#visible = false;
    this.#dismissed = true;
    this.#root.style.display = 'none';
  }

  dispose(): void {
    window.clearTimeout(this.#shieldTimer);
    this.#root.remove();
  }
}

/**
 * "More than a Game" and "Skill meets Strategy", in the top corners.
 *
 * Absolutely positioned and hidden on short screens: on a phone in portrait
 * the wordmark needs the height more than the corners need the copy.
 */
function buildCornerTaglines(): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'carrom-corners';
  wrap.setAttribute('aria-hidden', 'true');

  const left = document.createElement('span');
  left.className = 'carrom-corner carrom-corner--left';
  left.innerHTML = '<i>More</i><i>than a Game</i>';

  const right = document.createElement('span');
  right.className = 'carrom-corner carrom-corner--right';
  right.innerHTML = '<i>Skill meets</i><i>Strategy</i>';

  wrap.append(left, right);
  return wrap;
}

/**
 * Crown, wordmark, plaque, subtitle.
 *
 * The `O` of CARROM is a coin rather than a letter — the one idea in the
 * reference doing real work, since it says what the game is before a word of
 * it is read. It carries the same concentric rings as the Queen on the board,
 * so the mark and the piece are recognisably the same object.
 */
function buildWordmark(): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'carrom-mark';

  const crown = document.createElement('span');
  crown.className = 'carrom-crown';
  crown.setAttribute('aria-hidden', 'true');
  crown.innerHTML = CROWN_SVG;

  // One h1 for the page, with the accessible name on it; everything inside is
  // decoration, including the coin standing in for a letter.
  const title = document.createElement('h1');
  title.className = 'carrom-wordmark';
  title.setAttribute('aria-label', 'Carrom Arena');

  const word = document.createElement('span');
  word.className = 'carrom-word';
  word.setAttribute('aria-hidden', 'true');
  word.innerHTML = '<span class="carrom-gold">CARR</span>'
    + '<span class="carrom-coin"></span>'
    + '<span class="carrom-gold">M</span>';

  const plaque = document.createElement('span');
  plaque.className = 'carrom-plaque';
  plaque.setAttribute('aria-hidden', 'true');
  plaque.innerHTML = '<b>&#9670;</b><span class="carrom-gold">ARENA</span><b>&#9670;</b>';

  title.append(word, plaque);

  const sub = document.createElement('p');
  sub.className = 'carrom-sub';
  sub.textContent = 'A new level of carrom';

  wrap.append(crown, title, sub);
  return wrap;
}

/** The gold pill, and the one line of functional guidance under it. */
function buildPrompt(): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'carrom-prompt-wrap';

  const prompt = document.createElement('div');
  prompt.className = 'carrom-prompt';
  prompt.innerHTML = 'Tap to start<span aria-hidden="true">&#8250;</span>';

  // Not in the reference, and kept anyway: it is the reason this screen exists.
  const note = document.createElement('p');
  note.className = 'carrom-note';
  note.textContent = 'Sound on for the full experience';

  wrap.append(prompt, note);
  return wrap;
}

/** What is behind the tap. Named, not offered — see `MODES`. */
function buildModeRow(): HTMLElement {
  const row = document.createElement('div');
  row.className = 'carrom-modes';
  // The menu that follows lists all four as real, reachable controls. Reading
  // them out twice in a row would be noise.
  row.setAttribute('aria-hidden', 'true');

  for (const mode of MODES) {
    const item = document.createElement('span');
    item.className = 'carrom-mode';
    item.innerHTML = `${MODE_ICONS[mode.icon]}<i>${mode.label}</i>`;
    row.append(item);
  }

  return row;
}

const CROWN_SVG = `<svg viewBox="0 0 64 40" width="100%" height="100%" fill="none" aria-hidden="true">
  <path d="M6 34 L2 10 L18 20 L32 4 L46 20 L62 10 L58 34 Z"
        fill="url(#crownGold)" stroke="#7a4f13" stroke-width="1.6" stroke-linejoin="round"/>
  <circle cx="32" cy="4" r="3.4" fill="#f6d67f" stroke="#7a4f13" stroke-width="1.2"/>
  <defs>
    <linearGradient id="crownGold" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#fff3cd"/>
      <stop offset="45%" stop-color="#e0ac44"/>
      <stop offset="58%" stop-color="#9a6a1d"/>
      <stop offset="100%" stop-color="#f7e2a4"/>
    </linearGradient>
  </defs>
</svg>`;

/**
 * Line icons, drawn rather than borrowed.
 *
 * SVG and not emoji: an emoji is a different typeface on every platform, sized
 * and coloured by that platform, which is the opposite of a mark you control.
 */
const MODE_ICONS: Record<(typeof MODES)[number]['icon'], string> = {
  solo: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.4"/><path d="M5.5 19.5c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/></svg>`,
  together: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="8.5" cy="8" r="3"/><circle cx="16.5" cy="9.5" r="2.4"/><path d="M2.5 19c0-3.2 2.7-5.4 6-5.4s6 2.2 6 5.4"/><path d="M15 14.4c2.9 0 6 1.4 6 4.6"/></svg>`,
  online: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17"/><path d="M12 3.5c2.4 2.6 3.6 5.4 3.6 8.5S14.4 18.4 12 20.5c-2.4-2.1-3.6-5.4-3.6-8.5S9.6 6.1 12 3.5Z"/></svg>`,
  practice: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.6"/><circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"/></svg>`,
};

const SPLASH_CSS = `
.carrom-mark {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: clamp(6px, 1.4vh, 12px);
}

.carrom-crown {
  display: block;
  width: clamp(38px, 9vw, 62px);
  filter: drop-shadow(0 3px 6px rgba(0, 0, 0, 0.65));
  margin-bottom: -4px;
}

.carrom-wordmark {
  margin: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: clamp(4px, 1vh, 10px);
  text-align: center;
}

/*
 * The metal.
 *
 * A gradient clipped to the glyphs, with a stack of hard shadows below it for
 * the extrude and one soft shadow for the drop. The hard stack has to be
 * offset in whole pixels or the steps alias into a blur at small sizes.
 */
/*
 * The word row carries the type size, not the gold spans inside it.
 *
 * The coin is a sibling of those spans, and \`em\` resolves against an element's
 * own font-size — so with the size declared on the spans the coin sized itself
 * against the h1's inherited 16px and came out a dot beside 104px letters.
 */
.carrom-word {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font: 900 clamp(44px, 13vw, 104px) / 0.92 ${DISPLAY_FONT};
  letter-spacing: 0.005em;
}

.carrom-gold {
  background: ${GOLD};
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  text-shadow:
    0 1px 0 #8a5d18,
    0 2px 0 #7a5115,
    0 3px 0 #684312,
    0 4px 0 #52340d,
    0 10px 18px rgba(0, 0, 0, 0.72);
}

/*
 * The coin standing in for the O.
 *
 * Sized in em so it tracks the wordmark through every clamp step, and inset
 * box-shadows rather than nested elements for the rings — the same concentric
 * mark the Queen carries on the board.
 */
.carrom-coin {
  display: inline-block;
  width: 0.78em;
  height: 0.78em;
  border-radius: 50%;
  background: radial-gradient(circle at 38% 32%, #ff6a5a 0%, #e0342a 42%, #9c1710 100%);
  box-shadow:
    inset 0 0 0 0.055em #fdf0c4,
    inset 0 0 0 0.09em #b8241b,
    inset 0 0 0 0.13em #fdf0c4,
    inset 0 0.03em 0.06em rgba(255, 255, 255, 0.5),
    0 4px 0 #52340d,
    0 10px 18px rgba(0, 0, 0, 0.72);
  border: 0.045em solid #e8c46a;
  margin: 0 0.02em;
  vertical-align: middle;
  position: relative;
  top: -0.02em;
}

/* The dark plaque ARENA sits on. */
.carrom-plaque {
  display: inline-flex;
  align-items: center;
  gap: clamp(8px, 2.4vw, 18px);
  padding: clamp(4px, 1vh, 9px) clamp(14px, 4vw, 32px);
  border-radius: 8px;
  border: 1.5px solid #c8992f;
  background: linear-gradient(180deg, #4a2f1c, #2a1a10);
  font: 900 clamp(16px, 4.4vw, 34px) / 1 ${DISPLAY_FONT};
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 224, 160, 0.18);
}

.carrom-plaque .carrom-gold {
  letter-spacing: 0.34em;
  /* The plaque is small; the deep extrude would close up its counters. */
  text-shadow: 0 1px 0 #6d4712, 0 2px 3px rgba(0, 0, 0, 0.55);
  /* Letter-spacing pads the right edge; pull it back so the mark reads centred. */
  margin-right: -0.34em;
}

.carrom-plaque b {
  color: #d8a93c;
  font-size: clamp(7px, 1.6vw, 11px);
  line-height: 1;
}

.carrom-sub {
  margin: 0;
  font: 500 clamp(9px, 2.2vw, 12px) / 1.4 ${MONO_FONT};
  letter-spacing: 0.3em;
  text-transform: uppercase;
  /* 6.1:1 on the splash ground. */
  color: #cbb894;
  margin-right: -0.3em;
}

.carrom-prompt-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.carrom-prompt {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  /* Comfortably past the 44px minimum at every clamp step. */
  min-height: 52px;
  padding: 0 clamp(28px, 8vw, 52px);
  border-radius: 999px;
  border: 1.5px solid #f3dc9a;
  background: ${GOLD};
  color: #3a2408;
  font: 800 clamp(13px, 3.4vw, 17px) / 1 ${DISPLAY_FONT};
  letter-spacing: 0.14em;
  text-transform: uppercase;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.6);
  animation: carrom-pulse 2.4s ease-in-out infinite;
}

.carrom-prompt span {
  font-size: 1.5em;
  line-height: 0;
  position: relative;
  top: -0.06em;
}

.carrom-note {
  margin: 0;
  font: 500 clamp(9px, 2.2vw, 11px) / 1.4 ${MONO_FONT};
  letter-spacing: 0.16em;
  text-transform: uppercase;
  /* 4.6:1 — this is body-sized text and has to clear AA. */
  color: #a2937f;
  text-align: center;
  margin-right: -0.16em;
}

/*
 * The four modes.
 *
 * Not interactive, by design — see MODES. Divided by hairlines rather than
 * boxed, so the row reads as a caption rather than as four buttons.
 */
.carrom-modes {
  display: flex;
  align-items: stretch;
  gap: clamp(10px, 4vw, 30px);
  pointer-events: none;
}

.carrom-mode {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 7px;
  color: #bda87f;
  min-width: 0;
}

.carrom-mode + .carrom-mode {
  border-left: 1px solid rgba(200, 153, 47, 0.22);
  padding-left: clamp(10px, 4vw, 30px);
}

.carrom-mode svg {
  width: clamp(17px, 4.4vw, 21px);
  height: clamp(17px, 4.4vw, 21px);
  stroke: currentColor;
  stroke-width: 1.6;
  fill: none;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.carrom-mode i {
  font: 600 clamp(8px, 2.1vw, 10px) / 1 ${MONO_FONT};
  letter-spacing: 0.14em;
  text-transform: uppercase;
  font-style: normal;
  white-space: nowrap;
  margin-right: -0.14em;
}

.carrom-corners {
  position: absolute;
  inset: max(18px, env(safe-area-inset-top)) clamp(18px, 5vw, 46px) auto;
  display: flex;
  justify-content: space-between;
  pointer-events: none;
}

.carrom-corner {
  display: flex;
  flex-direction: column;
  color: #d3c09a;
}

.carrom-corner i {
  font-style: normal;
}

/* The handwritten note in the reference's top-left corner. */
.carrom-corner--left {
  font: italic 500 clamp(13px, 3.2vw, 20px) / 1.24 "Snell Roundhand", "Segoe Script", "Bradley Hand", cursive;
  letter-spacing: 0.01em;
}

.carrom-corner--left i:last-child {
  padding-bottom: 5px;
  border-bottom: 1px solid rgba(211, 192, 154, 0.4);
}

.carrom-corner--right {
  text-align: right;
  align-items: flex-end;
  font: 600 clamp(8px, 2vw, 11px) / 1.7 ${MONO_FONT};
  letter-spacing: 0.28em;
  text-transform: uppercase;
  margin-right: -0.28em;
}

.carrom-corner--right::after {
  content: "";
  width: 34px;
  height: 1px;
  margin-top: 8px;
  background: rgba(211, 192, 154, 0.4);
}

/* A gentle pulse marks the prompt as the thing to press. */
@keyframes carrom-pulse {
  0%, 100% { transform: scale(1); }
  50%      { transform: scale(1.035); }
}

/*
 * Portrait phones lose the corner copy and the mode row before they lose the
 * mark: at 640px tall with a keyboard-less browser chrome, stacking all five
 * blocks pushes the prompt under the fold, and a splash whose only control is
 * off-screen is worse than one that says less.
 */
@media (max-height: 620px) {
  .carrom-corners { display: none; }
}

@media (max-height: 520px) {
  .carrom-modes { display: none; }
}

@media (prefers-reduced-motion: reduce) {
  .carrom-prompt { animation: none; }
}
`;
