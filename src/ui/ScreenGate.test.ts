/**
 * The ghost-click guard, tested against a real DOM.
 *
 * These exercise the exact defect reported from an Android phone: one tap on
 * the splash walking through the menu and into the tutorial, having chosen
 * nothing. A touchscreen tap is a *sequence* — pointerdown, pointerup, then a
 * synthesised click whose target is hit-tested after the earlier handlers have
 * run — so a screen opened on pointerdown is clickable by the time the same
 * tap's click arrives.
 *
 * @vitest-environment happy-dom
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MainMenu } from './MainMenu';
import { ScreenGate } from './ScreenGate';
import { GameMode } from '../core/types';

describe('ScreenGate', () => {
  it('refuses a press that arrives with the screen', () => {
    const gate = new ScreenGate();
    gate.open();
    expect(gate.accepts()).toBe(false);
    expect(gate.blocked()).toBe(true);
  });

  it('accepts one that arrives after the gesture is over', () => {
    const gate = new ScreenGate();
    gate.open();
    vi.spyOn(performance, 'now').mockReturnValue(performance.now() + 1000);
    expect(gate.accepts()).toBe(true);
    vi.restoreAllMocks();
  });

  it('accepts anything on a screen that was never opened through it', () => {
    expect(new ScreenGate().accepts()).toBe(true);
  });
});

describe('MainMenu ghost clicks', () => {
  let container: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    container = document.createElement('div');
    document.body.append(container);
    vi.restoreAllMocks();
  });

  const cardFor = (title: string): HTMLButtonElement => {
    const card = [...container.querySelectorAll('button')].find((b) =>
      b.textContent?.includes(title),
    );
    if (!card) throw new Error(`no card for ${title}`);
    return card as HTMLButtonElement;
  };

  it('ignores the click left behind by the tap that opened it', () => {
    const onSelect = vi.fn();
    const menu = new MainMenu(container, onSelect);

    // The splash's tap shows the menu, and the same tap's click lands on a card.
    menu.show();
    cardFor('Play vs Computer').dispatchEvent(
      new window.MouseEvent('click', { bubbles: true, cancelable: true }),
    );

    expect(onSelect).not.toHaveBeenCalled();
  });

  it('accepts a press the player actually meant', () => {
    const onSelect = vi.fn();
    const menu = new MainMenu(container, onSelect);
    menu.show();

    // Well past the settle window: this is a new gesture.
    const later = performance.now() + 1000;
    vi.spyOn(performance, 'now').mockReturnValue(later);

    cardFor('Play vs Computer').dispatchEvent(
      new window.MouseEvent('click', { bubbles: true, cancelable: true }),
    );

    expect(onSelect).toHaveBeenCalledWith(GameMode.QuickMatch);
  });

  it('guards every card, not just the first', () => {
    const onSelect = vi.fn();
    const menu = new MainMenu(container, onSelect);
    menu.show();

    for (const title of ['Two Player', 'Four Player', 'Play with a Friend', 'Practice']) {
      cardFor(title).dispatchEvent(
        new window.MouseEvent('click', { bubbles: true, cancelable: true }),
      );
    }
    expect(onSelect).not.toHaveBeenCalled();
  });
});
