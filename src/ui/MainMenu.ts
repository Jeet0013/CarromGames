/**
 * Mode selection.
 *
 * The first screen a player sees, so it carries the game's identity: the dark
 * lacquer and brass of the board itself rather than a generic menu. Cards are
 * built from the same material vocabulary as the in-game player panels, so the
 * menu and the table feel like one object.
 *
 * A card can be locked. That is deliberate rather than hiding unfinished modes:
 * a player should be able to see what the game will offer, and a mode that
 * silently misbehaves is worse than one that says it is not ready.
 */

import { GameMode } from '../core/types';

export interface MenuOption {
  readonly mode: GameMode;
  readonly title: string;
  /** One line explaining what the mode actually is. */
  readonly blurb: string;
  /** Short tag: player count, opponent type. */
  readonly tag: string;
  readonly accent: string;
  /** When set, the card is unselectable and shows this reason. */
  readonly lockedReason?: string;
}

export const MENU_OPTIONS: readonly MenuOption[] = [
  {
    mode: GameMode.QuickMatch,
    title: 'Play vs Computer',
    blurb: 'One player against the machine. Four difficulty levels.',
    tag: '1 Player',
    accent: '#4fb3c4',
  },
  {
    mode: GameMode.LocalMultiplayer,
    title: 'Two Player',
    blurb: 'Two players share one device, taking turns from opposite sides.',
    tag: '2 Players',
    accent: '#e8a33d',
  },
  {
    mode: GameMode.FourPlayer,
    title: 'Four Player',
    blurb: 'Partners across the board — you and the player opposite you.',
    tag: '4 Players · Teams',
    accent: '#a487e0',
  },
  {
    mode: GameMode.Online,
    title: 'Play with a Friend',
    blurb: 'Share a link. They open it and you play across two devices.',
    tag: 'Online · 2 Players',
    accent: '#5fa8f5',
  },
  {
    mode: GameMode.Practice,
    title: 'Practice',
    blurb: 'The board to yourself. No turns, no pressure.',
    tag: 'Solo',
    accent: '#6fc08a',
  },
];

export class MainMenu {
  readonly #root: HTMLElement;
  readonly #onSelect: (mode: GameMode) => void;
  #visible = false;

  constructor(container: HTMLElement, onSelect: (mode: GameMode) => void) {
    this.#onSelect = onSelect;

    this.#root = document.createElement('div');
    this.#root.style.cssText = [
      'position:absolute',
      'inset:0',
      'display:none',
      'flex-direction:column',
      'align-items:center',
      'justify-content:center',
      'gap:clamp(12px, 2.4vh, 26px)',
      'padding:max(20px, env(safe-area-inset-top)) 20px max(24px, env(safe-area-inset-bottom))',
      // The board is behind this; a warm radial wash keeps it faintly visible
      // rather than blanking it out, so the menu reads as sitting on the table.
      'background:radial-gradient(ellipse at 50% 42%, rgba(28,23,18,0.86), rgba(10,9,8,0.96) 72%)',
      'backdrop-filter:blur(3px)',
      'z-index:60',
      'overflow-y:auto',
      '-webkit-overflow-scrolling:touch',
    ].join(';');

    this.#root.append(this.#buildHeader(), this.#buildCards());
    container.append(this.#root);
  }

  #buildHeader(): HTMLElement {
    const header = document.createElement('div');
    header.style.cssText =
      'display:flex;flex-direction:column;align-items:center;gap:6px;text-align:center';

    const title = document.createElement('h1');
    title.textContent = 'Carrom Arena';
    title.style.cssText = [
      'margin:0',
      'font:600 clamp(28px, 7vw, 46px)/1.05 system-ui, -apple-system, "Segoe UI", sans-serif',
      'letter-spacing:0.01em',
      'background:linear-gradient(180deg, #f7e7cf, #b07a45)',
      '-webkit-background-clip:text',
      'background-clip:text',
      'color:transparent',
      'text-wrap:balance',
    ].join(';');

    const sub = document.createElement('p');
    sub.textContent = 'Choose a game';
    sub.style.cssText = [
      'margin:0',
      'font:500 12px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace',
      'letter-spacing:0.22em',
      'text-transform:uppercase',
      'color:#9a8d7d',
    ].join(';');

    header.append(title, sub);
    return header;
  }

  #buildCards(): HTMLElement {
    const grid = document.createElement('div');
    grid.style.cssText = [
      'display:grid',
      // Two across when there is room, one when there is not. `auto-fit` with a
      // min track keeps four cards from stretching into dead space.
      'grid-template-columns:repeat(auto-fit, minmax(min(260px, 100%), 1fr))',
      'gap:12px',
      'width:min(560px, 100%)',
    ].join(';');

    for (const option of MENU_OPTIONS) grid.append(this.#buildCard(option));
    return grid;
  }

  #buildCard(option: MenuOption): HTMLElement {
    const locked = option.lockedReason !== undefined;

    const card = document.createElement('button');
    card.type = 'button';
    card.disabled = locked;
    card.style.cssText = [
      'position:relative',
      'display:flex',
      'flex-direction:column',
      'align-items:flex-start',
      'gap:5px',
      'padding:17px 16px',
      'border-radius:14px',
      'border:1px solid rgba(176,122,69,0.3)',
      'background:linear-gradient(165deg, rgba(34,28,22,0.95), rgba(19,16,13,0.95))',
      'color:#f4ece1',
      'text-align:left',
      'font:inherit',
      locked ? 'cursor:not-allowed' : 'cursor:pointer',
      locked ? 'opacity:0.45' : 'opacity:1',
      'transition:transform 140ms ease, border-color 140ms ease, box-shadow 140ms ease',
      '-webkit-tap-highlight-color:transparent',
    ].join(';');

    // A thin accent rail on the leading edge — the one place each mode's colour
    // appears, so the four cards are distinguishable at a glance without
    // colouring the whole surface.
    const rail = document.createElement('span');
    rail.style.cssText = [
      'position:absolute',
      'left:0',
      'top:14px',
      'bottom:14px',
      'width:3px',
      'border-radius:0 3px 3px 0',
      `background:${option.accent}`,
      locked ? 'opacity:0.5' : 'opacity:1',
    ].join(';');

    const tag = document.createElement('span');
    tag.textContent = locked ? `${option.tag} · ${option.lockedReason}` : option.tag;
    tag.style.cssText = [
      'font:600 12px/1 ui-monospace, SFMono-Regular, Menlo, monospace',
      'letter-spacing:0.16em',
      'text-transform:uppercase',
      `color:${locked ? '#9a8d7d' : option.accent}`,
    ].join(';');

    const title = document.createElement('span');
    title.textContent = option.title;
    title.style.cssText =
      'font:600 18px/1.2 system-ui, -apple-system, sans-serif;letter-spacing:0.01em';

    const blurb = document.createElement('span');
    blurb.textContent = option.blurb;
    blurb.style.cssText =
      'font:400 13px/1.45 system-ui, -apple-system, sans-serif;color:#9a8d7d';

    card.append(rail, tag, title, blurb);

    if (!locked) {
      card.addEventListener('pointerenter', () => {
        card.style.borderColor = option.accent;
        card.style.transform = 'translateY(-2px)';
        card.style.boxShadow = `0 8px 24px rgba(0,0,0,0.45), 0 0 0 1px ${option.accent}44`;
      });
      const rest = (): void => {
        card.style.borderColor = 'rgba(176,122,69,0.3)';
        card.style.transform = 'none';
        card.style.boxShadow = 'none';
      };
      card.addEventListener('pointerleave', rest);
      card.addEventListener('click', (event) => {
        // The canvas listens for pointer events beneath this overlay.
        event.stopPropagation();
        rest();
        this.#onSelect(option.mode);
      });
    }

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

  /** Unlock a mode once its system exists — used when the AI lands. */
  setLocked(mode: GameMode, locked: boolean): void {
    const index = MENU_OPTIONS.findIndex((o) => o.mode === mode);
    if (index < 0) return;
    const card = this.#root.querySelectorAll('button')[index];
    if (card instanceof HTMLButtonElement) {
      card.disabled = locked;
      card.style.opacity = locked ? '0.45' : '1';
      card.style.cursor = locked ? 'not-allowed' : 'pointer';
    }
  }

  dispose(): void {
    this.#root.remove();
  }
}
