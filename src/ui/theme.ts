/**
 * The material vocabulary every overlay is built from.
 *
 * ## Why this exists
 *
 * The screens drifted. The splash was gold on lacquer; the menu was charcoal
 * cards with a different accent colour on each one — cyan, orange, purple,
 * blue, green — and a third gold for its heading. Nothing shared a value, a
 * hue or a typeface, so the two screens read as two products, and the menu in
 * particular read as generated rather than designed. Five accent colours is
 * the clearest tell there is: real products pick one.
 *
 * So there is one accent here, and it is the same brass the board's pockets
 * are made of. Modes are told apart by their name, their mark and their order,
 * which is how a menu tells things apart.
 *
 * ## What is deliberately not here
 *
 * Player seat colours. Those live in `PlayerPanel` and stay separate: telling
 * two players apart at a glance is a functional job, not a decorative one, and
 * it is the one place more than one hue earns its keep.
 */

import logoArt from '../assets/logo.png';

/** Heavy display face for names and numerals. Present on every platform. */
export const DISPLAY_FONT = '"Arial Black", "Arial Bold", Gadget, system-ui, sans-serif';
/** Everything you actually read. */
export const TEXT_FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
/** Labels, counts, stamps — anything that wants to line up in a column. */
export const MONO_FONT = 'ui-monospace, SFMono-Regular, Menlo, monospace';

export const COLORS = {
  /** The one accent. Polished brass, the same metal as the pocket rings. */
  brass: '#c9982f',
  brassDim: 'rgba(201, 152, 47, 0.28)',
  brassFaint: 'rgba(201, 152, 47, 0.13)',
  /** Lacquer, matching the board frame. Used sparingly — it is the board's. */
  lacquer: '#7a1e21',
  /**
   * Warm greys, all tinted from the same brown.
   *
   * Mixing a warm grey with a cool one is invisible in isolation and obvious
   * side by side; every neutral in the UI comes from this ramp.
   */
  ink: '#f4ece1',
  inkSoft: '#cdbfab',
  /** 4.6:1 on the plate — the floor for anything at body size. */
  inkMuted: '#a2937f',
  plate: 'rgba(31, 25, 20, 0.92)',
  plateDeep: 'rgba(17, 14, 11, 0.94)',
} as const;

/** The metal, as a fill. Cool highlight, warm body, dark waist, lit lower edge. */
export const GOLD =
  'linear-gradient(179deg, #fffdf2 2%, #ffe9a4 19%, #f3c64f 41%, #bd8722 53%, #f4d275 69%, #fff7db 94%)';

/**
 * Stacking order, named.
 *
 * Overlays were assigning 60, 90 and one 9999 by feel, which is how two panels
 * end up fighting and a third ends up above a modal it should sit under.
 */
export const LAYER = {
  hud: 40,
  screen: 60,
  dialog: 80,
  splash: 90,
} as const;

/**
 * Fine grain, as a data URI.
 *
 * Every surface in this UI is a flat fill over a 3D scene, and a flat fill is
 * the thing that reads as digital. Fractal noise at low opacity is enough to
 * break it — the same trick as the film grain on a title card, and cheaper
 * than a texture because the browser generates it.
 */
export const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)' opacity='0.35'/%3E%3C/svg%3E\")";

const injected = new Set<string>();

/**
 * Add a stylesheet once, however many times its screen is constructed.
 *
 * These overlays were styled entirely with inline `cssText`, which cannot
 * express `:hover`, `:active` or `:focus-visible` — so hover was hand-rolled
 * with pointerenter/pointerleave listeners, press feedback did not exist, and
 * neither did a focus ring. A real sheet gets all three for free, and gets
 * them right on touch devices, where `pointerenter` fires on tap and then
 * sticks.
 */
export function injectSheet(id: string, css: string): void {
  if (injected.has(id)) return;
  injected.add(id);

  const style = document.createElement('style');
  style.dataset['carrom'] = id;
  style.textContent = css;
  document.head.append(style);
}

/**
 * Shared rules: the plate, the brass rule, focus, and the grain overlay.
 *
 * Every screen calls this; `injectSheet` makes the repeats free.
 */
export function injectBaseSheet(): void {
  injectSheet(
    'base',
    `
.cx-plate {
  position: relative;
  border-radius: 4px;
  background:
    linear-gradient(168deg, ${COLORS.plate}, ${COLORS.plateDeep});
  box-shadow:
    0 24px 60px rgba(0, 0, 0, 0.6),
    /* Tinted to the ground rather than pure black — a black shadow on a warm
       surface is the other half of why flat UI reads as flat. */
    0 2px 10px rgba(40, 20, 6, 0.5),
    inset 0 0 0 1px ${COLORS.brassDim},
    inset 0 1px 0 rgba(255, 226, 160, 0.1);
}

/* Grain sits above the plate and below its content. */
.cx-plate::before {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background-image: ${GRAIN};
  opacity: 0.35;
  mix-blend-mode: overlay;
  pointer-events: none;
}

.cx-gold {
  background: ${GOLD};
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

/* A hairline of brass, brightest in the middle — a struck rule, not a border. */
.cx-rule {
  height: 1px;
  border: 0;
  margin: 0;
  background: linear-gradient(90deg, transparent, ${COLORS.brassDim} 22%, ${COLORS.brassDim} 78%, transparent);
}

/*
 * One focus ring for the whole UI.
 *
 * :focus-visible rather than :focus, so a mouse press does not leave a ring
 * behind on a control that has just been clicked.
 */
.cx-focus:focus-visible {
  outline: 2px solid ${COLORS.brass};
  outline-offset: 3px;
  border-radius: 3px;
}

@media (prefers-reduced-motion: reduce) {
  .cx-anim, .cx-anim * { animation: none !important; transition: none !important; }
}
`,
  );
}

/**
 * The game's mark, as an element.
 *
 * Every full-screen overlay is branded from here rather than typesetting the
 * name again — the menu and the difficulty screen were each drawing their own
 * heading in their own gradient, which is how two screens of one flow end up
 * looking like two products.
 */
/** One star, drawn, so its shape is ours rather than the font's. */
export function starMark(filled: boolean): HTMLElement {
  const star = document.createElement('span');
  star.className = filled ? 'cx-star cx-star--on' : 'cx-star cx-star--off';
  star.innerHTML =
    '<svg viewBox="0 0 24 24" aria-hidden="true">'
    + '<path d="M12 2.6l2.9 5.9 6.5.95-4.7 4.58 1.11 6.47L12 17.44 6.19 20.5l1.11-6.47L2.6 9.45l6.5-.95z"'
    + ` fill="${filled ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.4"`
    + ' stroke-linejoin="round"/></svg>';
  return star;
}

export function brandMark(size: 'lg' | 'sm' = 'sm'): HTMLElement {
  const logo = document.createElement('img');
  logo.src = logoArt;
  logo.alt = 'Carrom Arena';
  logo.width = 560;
  logo.height = 280;
  logo.className = `cx-brand cx-brand--${size}`;
  return logo;
}

/**
 * Furniture every full-screen overlay shares: the ground, the plate it sits
 * on, the eyebrow, the rows and the back button.
 *
 * Split from `injectBaseSheet` because the HUD wants the plate and the focus
 * ring without any of this.
 */
export function injectScreenSheet(): void {
  injectBaseSheet();
  injectSheet(
    'screen',
    `
.cx-screen {
  position: absolute;
  inset: 0;
  display: none;
  flex-direction: column;
  align-items: center;
  /* Never center: a tall panel on a short screen must scroll from the top
     rather than have its head cut off. */
  justify-content: flex-start;
  padding: max(20px, env(safe-area-inset-top)) 20px max(24px, env(safe-area-inset-bottom));
  background: radial-gradient(ellipse at 50% 42%, rgba(26, 20, 15, 0.8), rgba(9, 8, 7, 0.95) 74%);
  backdrop-filter: blur(3px);
  z-index: ${LAYER.screen};
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

.cx-screen-panel {
  width: min(470px, 100%);
  margin: auto 0;
  padding: clamp(20px, 4vh, 30px) 0 clamp(12px, 2vh, 18px);
}

.cx-screen-head {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: clamp(10px, 2vh, 16px);
  padding: 0 clamp(20px, 5vw, 30px);
}

.cx-brand {
  display: block;
  height: auto;
  filter: drop-shadow(0 6px 14px rgba(0, 0, 0, 0.6));
}

.cx-brand--lg { width: clamp(190px, 46vw, 270px); }
.cx-brand--sm { width: clamp(140px, 34vw, 190px); }

/*
 * The one place small caps are used, and only once per screen.
 *
 * An eyebrow over every item is a label nobody reads; an eyebrow naming the
 * screen is a heading.
 */
.cx-eyebrow {
  margin: 0;
  font: 600 11px / 1 ${MONO_FONT};
  letter-spacing: 0.26em;
  text-transform: uppercase;
  color: ${COLORS.inkMuted};
  /* Letter-spacing pads the right edge; pull it back so it reads centred. */
  margin-right: -0.26em;
}

.cx-list {
  list-style: none;
  margin: clamp(6px, 1.4vh, 12px) 0 0;
  padding: 0;
}

.cx-list li + li .cx-row::before {
  content: "";
  position: absolute;
  top: 0;
  left: clamp(20px, 5vw, 30px);
  right: clamp(20px, 5vw, 30px);
  height: 1px;
  background: linear-gradient(90deg, transparent, ${COLORS.brassFaint} 18%, ${COLORS.brassFaint} 82%, transparent);
}

.cx-row {
  position: relative;
  display: flex;
  align-items: center;
  gap: clamp(12px, 3vw, 18px);
  width: 100%;
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

.cx-row:disabled { cursor: not-allowed; opacity: 0.4; }

@media (any-hover: hover) {
  .cx-row:not(:disabled):hover { background-color: rgba(201, 152, 47, 0.07); }
  .cx-row:not(:disabled):hover .cx-row-name { color: #ffeec2; }
  .cx-row:not(:disabled):hover .cx-mark { color: ${COLORS.brass}; transform: scale(1.06); }
}

.cx-row:not(:disabled):active {
  transform: translateY(1px);
  background-color: rgba(201, 152, 47, 0.11);
}

.cx-mark {
  flex: none;
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  color: ${COLORS.inkSoft};
  transition: color 180ms ease, transform 180ms ease;
}

.cx-mark svg {
  width: 22px;
  height: 22px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.5;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.cx-row-text { display: flex; flex-direction: column; gap: 3px; min-width: 0; }

.cx-row-name {
  font: 600 clamp(15px, 3.8vw, 17px) / 1.2 ${TEXT_FONT};
  transition: color 180ms ease;
}

.cx-row-blurb {
  font: 400 clamp(12px, 3.2vw, 13px) / 1.4 ${TEXT_FONT};
  color: ${COLORS.inkMuted};
  text-wrap: pretty;
}

.cx-row-meta {
  flex: none;
  margin-left: auto;
  font: 500 11px / 1 ${MONO_FONT};
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.1em;
  color: ${COLORS.inkMuted};
  white-space: nowrap;
}

/*
 * Strength, as stars.
 *
 * Drawn as SVG rather than typed as the ★ character: a glyph's shape, weight
 * and vertical alignment are whichever font ends up rendering it, which
 * differs across the platforms this ships to. This one is the same star
 * everywhere, and it is filled in the one accent rather than in a colour per
 * difficulty.
 */
.cx-stars {
  display: flex;
  gap: 3px;
  margin-left: auto;
  flex: none;
}

.cx-star {
  width: 15px;
  height: 15px;
  color: ${COLORS.brass};
}

.cx-star--off { color: rgba(201, 152, 47, 0.3); }

.cx-star svg { width: 100%; height: 100%; display: block; }

.cx-star--on svg { filter: drop-shadow(0 0 4px rgba(201, 152, 47, 0.45)); }

/*
 * The button system. Four kinds, and no fifth.
 *
 * - primary: the one thing this screen wants you to do. Struck in the metal.
 * - quiet:   the alternative. Same size and shape, no fill.
 * - danger:  leaving a match. The board's lacquer, used as a warning.
 * - icon:    a round control in a corner.
 *
 * They live here rather than on the screen that first needed them. "Got it"
 * on the tutorial was styled by a class defined in the victory screen's
 * stylesheet, which meant it was only styled at all if a match had already
 * ended — a bug that would have shipped looking like a CSS load-order fluke.
 */
.cx-btn {
  min-height: 48px;
  padding: 0 26px;
  border-radius: 999px;
  font: 700 13px / 1 ${TEXT_FONT};
  letter-spacing: 0.08em;
  text-transform: uppercase;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: transform 120ms ease, box-shadow 180ms ease, background-color 180ms ease;
}

.cx-btn--primary {
  border: 1px solid #f3dc9a;
  background: ${GOLD};
  color: #3a2408;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.6);
}

.cx-btn--quiet {
  border: 1px solid ${COLORS.brassDim};
  background: transparent;
  color: ${COLORS.inkSoft};
}

/*
 * The one destructive action in the game: leaving a match in progress.
 *
 * Struck in the board's own lacquer rather than in the metal — the same
 * material vocabulary, used as a warning instead of an invitation.
 */
.cx-btn--danger {
  border: 1px solid rgba(198, 72, 60, 0.6);
  background: linear-gradient(170deg, #a8302a, #6b191b);
  color: #fdece8;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 200, 190, 0.18);
}

/*
 * Round controls: exit, help, sound, powder.
 *
 * These were already consistent with each other — four hand-rolled circles at
 * the same size with the same border, repeated four times. What none of them
 * had was a hover state, any press feedback, or a focus ring, and their
 * colours were literals sitting outside the palette. Saying it once fixes all
 * four and means the fifth cannot drift.
 */
.cx-icon-btn {
  display: grid;
  place-items: center;
  width: 46px;
  height: 46px;
  padding: 0;
  border-radius: 50%;
  border: 1px solid ${COLORS.brassDim};
  background: linear-gradient(168deg, rgba(31, 25, 20, 0.9), rgba(17, 14, 11, 0.92));
  color: ${COLORS.inkSoft};
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.45);
  transition: transform 120ms ease, color 180ms ease, border-color 180ms ease, background-color 180ms ease;
}

.cx-icon-btn svg {
  width: 20px;
  height: 20px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-linejoin: round;
}

@media (any-hover: hover) {
  .cx-btn--primary:hover {
    box-shadow: 0 8px 22px rgba(0, 0, 0, 0.55), 0 0 22px rgba(255, 214, 120, 0.3);
  }
  .cx-btn--quiet:hover { background-color: rgba(201, 152, 47, 0.1); color: ${COLORS.ink}; }
  .cx-btn--danger:hover {
    box-shadow: 0 8px 22px rgba(0, 0, 0, 0.55), 0 0 20px rgba(198, 72, 60, 0.35);
  }
  .cx-icon-btn:hover {
    color: ${COLORS.brass};
    border-color: ${COLORS.brass};
    background-color: rgba(201, 152, 47, 0.12);
  }
}

/* One press feel for every button in the game. */
.cx-btn:active, .cx-icon-btn:active { transform: translateY(1px) scale(0.98); }

.cx-btn:disabled, .cx-icon-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.cx-btn:disabled:active, .cx-icon-btn:disabled:active { transform: none; }

/* Quiet by default: leaving is never the thing you want emphasised. */
.cx-back {
  display: block;
  margin: clamp(10px, 2vh, 16px) auto 0;
  min-height: 44px;
  padding: 0 22px;
  border: 0;
  background: transparent;
  color: ${COLORS.inkMuted};
  font: 500 13px / 1 ${TEXT_FONT};
  cursor: pointer;
  border-radius: 999px;
  -webkit-tap-highlight-color: transparent;
  transition: color 160ms ease, background-color 160ms ease;
}

@media (any-hover: hover) {
  .cx-back:hover { color: ${COLORS.ink}; background-color: rgba(201, 152, 47, 0.08); }
}

.cx-back:active { color: ${COLORS.ink}; background-color: rgba(201, 152, 47, 0.14); }
`,
  );
}
