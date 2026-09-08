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
 */

export class SplashScreen {
  readonly #root: HTMLElement;
  #visible = false;

  constructor(container: HTMLElement, onStart: () => void) {
    this.#root = document.createElement('div');
    this.#root.style.cssText = [
      'position:absolute',
      'inset:0',
      'display:none',
      'flex-direction:column',
      'align-items:center',
      'justify-content:center',
      'gap:22px',
      'padding:24px',
      'background:radial-gradient(ellipse at 50% 44%, rgba(30,24,18,0.88), rgba(9,8,7,0.97) 72%)',
      'backdrop-filter:blur(3px)',
      'z-index:90',
      'cursor:pointer',
      '-webkit-tap-highlight-color:transparent',
    ].join(';');

    const title = document.createElement('h1');
    title.textContent = 'Carrom Arena';
    title.style.cssText = [
      'margin:0',
      'font:600 clamp(32px, 9vw, 56px)/1.02 system-ui, -apple-system, "Segoe UI", sans-serif',
      'letter-spacing:0.01em',
      'background:linear-gradient(180deg, #f7e7cf, #b07a45)',
      '-webkit-background-clip:text',
      'background-clip:text',
      'color:transparent',
      'text-align:center',
    ].join(';');

    const prompt = document.createElement('div');
    prompt.textContent = 'Tap to start';
    prompt.style.cssText = [
      'padding:16px 34px',
      'border-radius:999px',
      'border:1px solid rgba(176,122,69,0.55)',
      'background:linear-gradient(170deg, #e8a33d, #b07a45)',
      'color:#1a140e',
      'font:700 14px/1 system-ui, -apple-system, sans-serif',
      'letter-spacing:0.1em',
      'text-transform:uppercase',
      'animation:carrom-pulse 2s ease-in-out infinite',
    ].join(';');

    const note = document.createElement('p');
    note.textContent = 'Sound on for the full experience';
    note.style.cssText = [
      'margin:0',
      'font:500 12px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace',
      'letter-spacing:0.14em',
      'text-transform:uppercase',
      'color:#9a8d7d',
      'text-align:center',
    ].join(';');

    // A gentle pulse marks the prompt as the thing to press, without motion
    // for anyone who has asked their system for less of it.
    const style = document.createElement('style');
    style.textContent = `
      @keyframes carrom-pulse {
        0%, 100% { transform: scale(1); opacity: 1; }
        50%      { transform: scale(1.04); opacity: 0.92; }
      }
      @media (prefers-reduced-motion: reduce) {
        [style*="carrom-pulse"] { animation: none !important; }
      }`;
    document.head.append(style);

    this.#root.append(title, prompt, note);
    // Pointerdown, not click: the audio unlock listens on the same event, and
    // starting both from one gesture is what makes the music arrive with the
    // menu rather than a beat behind it.
    this.#root.addEventListener('pointerdown', () => {
      this.hide();
      onStart();
    });

    container.append(this.#root);
  }

  get visible(): boolean {
    return this.#visible;
  }

  show(): void {
    this.#visible = true;
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
