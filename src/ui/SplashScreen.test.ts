/**
 * The splash, tested against a real DOM.
 *
 * The reported fault: one tap on "Tap to start" started the game *and* chose a
 * mode, because the browser hit-tests a click's target after the pointerdown
 * handler has already swapped the screen underneath. These check both halves
 * of the defence — the shield that keeps this element in the hit path until
 * the gesture is spent, and the fact that it then gets out of the way.
 *
 * @vitest-environment happy-dom
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SplashScreen } from './SplashScreen';

describe('SplashScreen', () => {
  let container: HTMLElement;

  const tap = (el: Element) =>
    el.dispatchEvent(
      new window.PointerEvent('pointerdown', { bubbles: true, cancelable: true }),
    );

  const root = (): HTMLElement => container.firstElementChild as HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    container = document.createElement('div');
    document.body.append(container);
    vi.useRealTimers();
  });

  it('starts the game on the first press, without waiting for the click', () => {
    const onStart = vi.fn();
    new SplashScreen(container, onStart).show();
    tap(root());
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('stays in the hit path, invisible, so the click cannot fall through', () => {
    new SplashScreen(container, vi.fn()).show();
    tap(root());

    // Transparent, but still displayed — that is what absorbs the click.
    expect(root().style.opacity).toBe('0');
    expect(root().style.display).toBe('flex');
  });

  it('swallows the click the same tap produces', () => {
    new SplashScreen(container, vi.fn()).show();
    tap(root());

    const click = new window.MouseEvent('click', { bubbles: true, cancelable: true });
    root().dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
  });

  it('leaves once the click has been absorbed', () => {
    new SplashScreen(container, vi.fn()).show();
    tap(root());
    root().dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(root().style.display).toBe('none');
  });

  it('leaves anyway when no click ever arrives', async () => {
    vi.useFakeTimers();
    new SplashScreen(container, vi.fn()).show();
    tap(root());
    expect(root().style.display).toBe('flex');

    await vi.advanceTimersByTimeAsync(600);
    expect(root().style.display).toBe('none');
    vi.useRealTimers();
  });

  it('starts the game once however many events the tap produces', () => {
    const onStart = vi.fn();
    new SplashScreen(container, onStart).show();
    tap(root());
    tap(root());
    expect(onStart).toHaveBeenCalledTimes(1);
  });
});
