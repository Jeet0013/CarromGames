/**
 * Difficulty selection, shown after choosing Play vs Computer.
 *
 * Reuses the menu's card language exactly — same lacquer, same accent rail,
 * same type scale — so it reads as the next step of one flow rather than a
 * different screen. The only addition is a four-star strength indicator, which
 * conveys relative difficulty faster than the descriptions do.
 */

import { AIDifficulty, DIFFICULTY_INFO, DIFFICULTY_ORDER } from '../ai/AIDifficulty';

export class DifficultySelect {
  readonly #root: HTMLElement;
  #visible = false;

  constructor(
    container: HTMLElement,
    onSelect: (difficulty: AIDifficulty) => void,
    onBack: () => void,
  ) {
    this.#root = document.createElement('div');
    this.#root.style.cssText = [
      'position:absolute',
      'inset:0',
      'display:none',
      'flex-direction:column',
      'background:radial-gradient(ellipse at 50% 42%, rgba(28,23,18,0.86), rgba(10,9,8,0.96) 72%)',
      'backdrop-filter:blur(3px)',
      'z-index:62',
    ].join(';');

    const scroll = document.createElement('div');
    scroll.style.cssText = [
      'flex:1 1 auto',
      'min-height:0',
      'overflow-y:auto',
      '-webkit-overflow-scrolling:touch',
      'overscroll-behavior:contain',
      'display:flex',
      'flex-direction:column',
      'align-items:center',
      'justify-content:flex-start',
      'gap:clamp(14px, 2.5vh, 24px)',
      'padding:max(20px, env(safe-area-inset-top)) 20px 96px',
    ].join(';');

    const title = document.createElement('h2');
    title.textContent = 'Select difficulty';
    title.style.cssText = [
      'margin:0',
      'font:600 clamp(22px, 5.5vw, 32px)/1.1 system-ui, -apple-system, sans-serif',
      'background:linear-gradient(180deg, #f7e7cf, #b07a45)',
      '-webkit-background-clip:text',
      'background-clip:text',
      'color:transparent',
    ].join(';');

    const grid = document.createElement('div');
    grid.style.cssText = [
      'display:grid',
      'grid-template-columns:repeat(auto-fit, minmax(min(240px, 100%), 1fr))',
      'gap:11px',
      'width:min(560px, 100%)',
    ].join(';');

    for (const difficulty of DIFFICULTY_ORDER) {
      grid.append(this.#buildCard(difficulty, onSelect));
    }

    const back = document.createElement('button');
    back.type = 'button';
    back.textContent = '← Back';
    back.style.cssText = [
      'padding:16px 26px',
      'border-radius:999px',
      'border:1px solid rgba(176,122,69,0.35)',
      'background:transparent',
      'color:#9a8d7d',
      'font:600 13px/1 system-ui, -apple-system, sans-serif',
      'letter-spacing:0.06em',
      'cursor:pointer',
      '-webkit-tap-highlight-color:transparent',
    ].join(';');
    back.addEventListener('click', (event) => {
      event.stopPropagation();
      onBack();
    });

    const content = document.createElement('div');
    content.style.cssText =
      'display:flex;flex-direction:column;align-items:center;gap:clamp(14px, 2.5vh, 24px);width:100%;margin:auto 0';
    content.append(title, grid);
    scroll.append(content);

    const footer = document.createElement('div');
    footer.style.cssText = [
      'position:absolute',
      'left:0',
      'right:0',
      'bottom:0',
      'display:flex',
      'justify-content:center',
      'padding:14px 18px max(16px, env(safe-area-inset-bottom))',
      'background:linear-gradient(to top, rgba(10,9,8,0.95) 55%, rgba(10,9,8,0))',
      'pointer-events:none',
    ].join(';');
    back.style.pointerEvents = 'auto';
    footer.append(back);

    this.#root.append(scroll, footer);
    container.append(this.#root);
  }

  #buildCard(
    difficulty: AIDifficulty,
    onSelect: (d: AIDifficulty) => void,
  ): HTMLElement {
    const info = DIFFICULTY_INFO[difficulty];

    const card = document.createElement('button');
    card.type = 'button';
    card.style.cssText = [
      'position:relative',
      'display:flex',
      'flex-direction:column',
      'align-items:flex-start',
      'gap:5px',
      'padding:16px 16px',
      'border-radius:14px',
      'border:1px solid rgba(176,122,69,0.3)',
      'background:linear-gradient(165deg, rgba(34,28,22,0.95), rgba(19,16,13,0.95))',
      'color:#f4ece1',
      'text-align:left',
      'cursor:pointer',
      'transition:transform 140ms ease, border-color 140ms ease, box-shadow 140ms ease',
      '-webkit-tap-highlight-color:transparent',
    ].join(';');

    const rail = document.createElement('span');
    rail.style.cssText = [
      'position:absolute',
      'left:0',
      'top:13px',
      'bottom:13px',
      'width:3px',
      'border-radius:0 3px 3px 0',
      `background:${info.accent}`,
    ].join(';');

    const row = document.createElement('span');
    row.style.cssText = 'display:flex;align-items:center;gap:9px;width:100%';

    const name = document.createElement('span');
    name.textContent = info.label;
    name.style.cssText =
      'font:600 18px/1.2 system-ui, -apple-system, sans-serif;letter-spacing:0.01em';

    const stars = document.createElement('span');
    // Filled versus hollow, not a count — the shape carries the comparison.
    stars.textContent = '★'.repeat(info.stars) + '☆'.repeat(4 - info.stars);
    stars.style.cssText = `margin-left:auto;font-size:13px;letter-spacing:0.12em;color:${info.accent}`;
    stars.setAttribute('aria-label', `${info.stars} of 4`);

    row.append(name, stars);

    const blurb = document.createElement('span');
    blurb.textContent = info.description;
    blurb.style.cssText =
      'font:400 13px/1.45 system-ui, -apple-system, sans-serif;color:#9a8d7d';

    card.append(rail, row, blurb);

    card.addEventListener('pointerenter', () => {
      card.style.borderColor = info.accent;
      card.style.transform = 'translateY(-2px)';
      card.style.boxShadow = `0 8px 24px rgba(0,0,0,0.45), 0 0 0 1px ${info.accent}44`;
    });
    const rest = (): void => {
      card.style.borderColor = 'rgba(176,122,69,0.3)';
      card.style.transform = 'none';
      card.style.boxShadow = 'none';
    };
    card.addEventListener('pointerleave', rest);
    card.addEventListener('click', (event) => {
      event.stopPropagation();
      rest();
      onSelect(difficulty);
    });

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
