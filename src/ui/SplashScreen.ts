/**
 * The welcome screen.
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
 * ## The artwork
 *
 * Supplied art, shown whole and unaltered. It is portrait (1024×1536) and the
 * browser is usually not, so it cannot simply be `cover`-cropped: the logo sits
 * near the top and the button near the bottom, and a landscape crop loses both.
 *
 * So it is drawn twice. A blurred, scaled copy fills the viewport as a ground,
 * and the real thing sits on top at its own aspect ratio, fitted whole. On a
 * phone the two coincide and you see only the art; on a desktop the blurred
 * copy becomes an ambient surround rather than two black bars. Nothing is
 * cropped and nothing is stretched at any size.
 *
 * The painted TAP TO START gets a real control positioned exactly over it —
 * hover on desktop, press feedback on touch — but the whole screen remains a
 * single tap target, because a live button sitting where the menu's cards are
 * about to appear is the arrangement that sent one Android tap three screens
 * deep.
 */

import welcomeArt from '../assets/welcome.jpg';
import { GAME_CONFIG } from '../config/GameConfig';
import { LAYER, MONO_FONT, injectSheet } from './theme';

/**
 * How long the invisible shield stays up after the tap.
 *
 * Only a fallback: the shield normally comes down the moment it swallows the
 * click. This bounds the wait for the browsers that never send one.
 */
const SHIELD_MS = 450;

/** The artwork's own proportions, so the stage can match them exactly. */
const ART = { width: 1024, height: 1536 } as const;

/**
 * Where the painted button sits, as fractions of the artwork.
 *
 * Measured off the supplied file. Because the stage below is given the art's
 * exact aspect ratio, these percentages land on the same pixels at every size
 * — no JavaScript measuring, and nothing to re-run on resize.
 */
const BUTTON = { top: 80.4, height: 6.2, width: 52, left: 50 } as const;

export class SplashScreen {
  readonly #root: HTMLElement;
  #visible = false;
  #dismissed = false;
  #shieldTimer = 0;

  constructor(container: HTMLElement, onStart: () => void) {
    injectSheet('splash', SPLASH_CSS);

    this.#root = document.createElement('div');
    this.#root.className = 'cx-splash cx-anim';

    // The blurred surround. Not the artwork's job to fill a shape it was not
    // drawn for, so a scaled copy does it and the art stays whole.
    const ground = document.createElement('div');
    ground.className = 'cx-splash-ground';
    ground.setAttribute('aria-hidden', 'true');

    const stage = document.createElement('div');
    stage.className = 'cx-splash-stage';

    const art = document.createElement('img');
    art.className = 'cx-splash-art';
    art.src = welcomeArt;
    art.width = ART.width;
    art.height = ART.height;
    // The art carries the game's name and its instruction as pixels. Without
    // this a screen reader finds a picture and nothing else.
    art.alt = 'Carrom Arena — a gold crowned logo on a carrom board. Tap to start.';
    // It is the whole screen; there is nothing to wait for.
    art.decoding = 'sync';
    art.fetchPriority = 'high';

    /*
     * A real control over the painted one.
     *
     * It does not stop the event: pointerdown bubbles to the root, whose
     * handler starts the game exactly as a tap anywhere else does. The button
     * exists for what it can express that a picture cannot — a hover state on
     * a device with a pointer, and a press state under a finger.
     */
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'cx-splash-button cx-focus';
    // The label is painted into the art; this names it for anyone not seeing it.
    button.setAttribute('aria-label', 'Tap to start');

    stage.append(art, button);

    /*
     * Which build this is.
     *
     * Deliberately visible rather than hidden in the console: the device that
     * matters is a phone at the other end of a share link, and every bug
     * report so far has had to start by establishing whether the fix being
     * discussed was even present. Small and dim enough to disappear.
     */
    const build = document.createElement('div');
    build.className = 'cx-splash-build';
    build.textContent = `Build ${GAME_CONFIG.build}`;

    this.#root.append(ground, stage, build);

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

      // The transition out: the art falls back and fades rather than cutting,
      // so the menu arrives on the same table rather than replacing a picture.
      this.#root.classList.add('is-leaving');
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
    this.#root.classList.remove('is-leaving');
    this.#root.style.display = 'block';
    // Restart the entry fade. Reading offsetWidth forces the style flush that
    // makes removing and re-adding the class actually replay the animation.
    this.#root.classList.remove('is-entering');
    void this.#root.offsetWidth;
    this.#root.classList.add('is-entering');
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

const SPLASH_CSS = `
.cx-splash {
  position: absolute;
  inset: 0;
  display: none;
  z-index: ${LAYER.splash};
  overflow: hidden;
  cursor: pointer;
  background: #0b0806;
  -webkit-tap-highlight-color: transparent;
}

/*
 * The entry fade, after the loading screen.
 *
 * Opacity and transform only — animating either is handed to the compositor,
 * where a full-screen image can afford it. Animating anything else here would
 * relayout the largest element on the page every frame.
 */
.cx-splash.is-entering .cx-splash-stage,
.cx-splash.is-entering .cx-splash-ground {
  animation: cx-splash-in 620ms cubic-bezier(0.22, 0.61, 0.36, 1) both;
}

@keyframes cx-splash-in {
  from { opacity: 0; transform: scale(1.03); }
  to   { opacity: 1; transform: scale(1); }
}

/* And the exit, into the menu. */
.cx-splash.is-leaving {
  opacity: 0;
  transform: scale(0.99);
  transition: opacity 260ms ease, transform 320ms ease;
}

/*
 * The surround: the same art, scaled up and blurred out.
 *
 * A portrait image on a landscape screen has to do something with the sides.
 * Black bars say "this did not fit"; this says the picture continues.
 */
.cx-splash-ground {
  position: absolute;
  inset: -6%;
  background: url(${JSON.stringify(welcomeArt)}) center / cover no-repeat;
  filter: blur(38px) saturate(0.82) brightness(0.42);
  transform: scale(1.1);
}

.cx-splash-stage {
  position: absolute;
  inset: 0;
  margin: auto;
  /* The art's own proportions. Percentages inside this box therefore land on
     the art's own pixels, at any size, with nothing to measure. */
  aspect-ratio: ${ART.width} / ${ART.height};
  max-width: 100%;
  max-height: 100%;
  /* Only as large as it really is — upscaling a JPEG past 1:1 just softens it. */
  width: min(100%, calc(100vh * ${ART.width} / ${ART.height}));
}

.cx-splash-art {
  display: block;
  width: 100%;
  height: 100%;
  /* Belt and braces: the stage already matches, so nothing is cropped. */
  object-fit: contain;
  /* The art is its own frame; a shadow separates it from the blurred ground. */
  box-shadow: 0 0 90px rgba(0, 0, 0, 0.55);
  user-select: none;
  -webkit-user-drag: none;
}

/*
 * The control over the painted button.
 *
 * Transparent: the art already draws the button. This only adds the two states
 * a picture cannot have.
 */
.cx-splash-button {
  position: absolute;
  top: ${BUTTON.top}%;
  left: ${BUTTON.left}%;
  width: ${BUTTON.width}%;
  height: ${BUTTON.height}%;
  transform: translate(-50%, -50%);
  /* Never below the 44px minimum, however small the art is drawn. */
  min-height: 44px;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: transparent;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: transform 160ms ease, box-shadow 200ms ease, background-color 200ms ease;
}

@media (any-hover: hover) {
  .cx-splash-button:hover {
    background-color: rgba(255, 244, 214, 0.14);
    box-shadow: 0 0 26px 6px rgba(255, 214, 120, 0.34);
    transform: translate(-50%, -50%) scale(1.03);
  }
}

/* Press feedback, which matters most on the device that has no hover. */
.cx-splash-button:active {
  transform: translate(-50%, -50%) scale(0.975);
  background-color: rgba(120, 74, 12, 0.22);
  box-shadow: inset 0 2px 8px rgba(0, 0, 0, 0.4);
}

.cx-splash-build {
  position: absolute;
  bottom: max(6px, env(safe-area-inset-bottom));
  left: 0;
  right: 0;
  text-align: center;
  font: 500 10px/1 ${MONO_FONT};
  letter-spacing: 0.1em;
  color: rgba(255, 236, 200, 0.34);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
  pointer-events: none;
}
`;
