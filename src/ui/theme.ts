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
