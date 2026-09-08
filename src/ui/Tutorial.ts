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
  #visible = false;

  constructor(container: HTMLElement, onDismiss: () => void) {
    this.#onDismiss = onDismiss;

    this.#root = document.createElement('div');
    this.#root.style.cssText = [
      'position:absolute',
      'inset:0',
      'display:none',
      'flex-direction:column',
      'align-items:center',
      'justify-content:center',
      'gap:18px',
      'padding:max(18px, env(safe-area-inset-top)) 18px max(18px, env(safe-area-inset-bottom))',
      'background:rgba(10,9,8,0.9)',
      'backdrop-filter:blur(4px)',
      'z-index:70',
      'overflow-y:auto',
    ].join(';');

    const heading = document.createElement('h2');
    heading.textContent = 'How to play';
    heading.style.cssText = [
      'margin:0',
      'font:600 clamp(20px, 5vw, 27px)/1.1 system-ui, -apple-system, sans-serif',
      'color:#f7e7cf',
      'letter-spacing:0.01em',
    ].join(';');

    const steps = document.createElement('div');
    steps.style.cssText = [
      'display:grid',
      'grid-template-columns:repeat(auto-fit, minmax(min(210px, 100%), 1fr))',
      'gap:12px',
      'width:min(720px, 100%)',
    ].join(';');
    STEPS.forEach((step, index) => steps.append(this.#buildStep(step, index + 1)));

    const done = document.createElement('button');
    done.type = 'button';
    done.textContent = 'Got it';
    done.style.cssText = [
      'padding:11px 30px',
      'border-radius:999px',
      'border:1px solid rgba(176,122,69,0.55)',
      'background:linear-gradient(170deg, #e8a33d, #b07a45)',
      'color:#1a140e',
      'font:700 13px/1 system-ui, -apple-system, sans-serif',
      'letter-spacing:0.09em',
      'text-transform:uppercase',
      'cursor:pointer',
      '-webkit-tap-highlight-color:transparent',
    ].join(';');
    done.addEventListener('click', (event) => {
      event.stopPropagation();
      this.hide();
      this.#onDismiss();
    });

    this.#root.append(heading, steps, done);
    container.append(this.#root);
  }

  #buildStep(
    step: { title: string; body: string; art: string },
    number: number,
  ): HTMLElement {
    const card = document.createElement('div');
    card.style.cssText = [
      'display:flex',
      'flex-direction:column',
      'align-items:center',
      'gap:9px',
      'padding:16px 15px',
      'border-radius:14px',
      'border:1px solid rgba(176,122,69,0.26)',
      'background:linear-gradient(165deg, rgba(34,28,22,0.95), rgba(19,16,13,0.95))',
      'text-align:center',
    ].join(';');

    const art = document.createElement('div');
    art.style.cssText = 'color:#b07a45;line-height:0';
    art.innerHTML = `<svg viewBox="0 0 100 92" width="94" height="86" aria-hidden="true">${step.art}</svg>`;

    const index = document.createElement('span');
    index.textContent = `Step ${number}`;
    index.style.cssText = [
      'font:600 9.5px/1 ui-monospace, SFMono-Regular, Menlo, monospace',
      'letter-spacing:0.18em',
      'text-transform:uppercase',
      'color:#e8a33d',
    ].join(';');

    const title = document.createElement('span');
    title.textContent = step.title;
    title.style.cssText =
      'font:600 15px/1.25 system-ui, -apple-system, sans-serif;color:#f4ece1';

    const body = document.createElement('span');
    body.textContent = step.body;
    body.style.cssText =
      'font:400 12.5px/1.5 system-ui, -apple-system, sans-serif;color:#9a8d7d;max-width:30ch';

    card.append(art, index, title, body);
    return card;
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
