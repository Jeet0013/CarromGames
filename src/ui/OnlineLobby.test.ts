/**
 * The lobby, tested against a real DOM.
 *
 * Covers the two things a share link can do wrong: arrive mangled, and be an
 * address that only ever existed on the sender's own machine.
 *
 * @vitest-environment happy-dom
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { OnlineLobby } from './OnlineLobby';

describe('OnlineLobby', () => {
  let container: HTMLElement;

  const build = () => {
    const onCancel = vi.fn();
    const onJoinCode = vi.fn();
    const lobby = new OnlineLobby(container, onCancel, onJoinCode);
    return { lobby, onCancel, onJoinCode };
  };

  const input = (): HTMLInputElement => {
    const el = container.querySelector('input');
    if (!el) throw new Error('no room code field');
    return el as HTMLInputElement;
  };

  const button = (label: string): HTMLButtonElement => {
    const el = [...container.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === label,
    );
    if (!el) throw new Error(`no ${label} button`);
    return el as HTMLButtonElement;
  };

  /** Past the gate's settle window, so presses count as the player's own. */
  const settle = () => vi.spyOn(performance, 'now').mockReturnValue(performance.now() + 1000);

  beforeEach(() => {
    document.body.innerHTML = '';
    container = document.createElement('div');
    document.body.append(container);
    vi.restoreAllMocks();
  });

  it('offers a way in by code when hosting', () => {
    const { lobby } = build();
    lobby.showHosting('https://example.com/?join=carrom-a1b2c3', 'carrom-a1b2c3');
    expect(input()).toBeTruthy();
    expect(container.textContent).toContain('Room a1b2c3');
  });

  it('hands the typed code to the caller', () => {
    const { lobby, onJoinCode } = build();
    lobby.showHosting('https://example.com/?join=carrom-a1b2c3', 'carrom-a1b2c3');
    settle();

    input().value = 'd4e5f6';
    button('Join').dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));

    expect(onJoinCode).toHaveBeenCalledWith('d4e5f6');
  });

  it('does not act on an empty field', () => {
    const { lobby, onJoinCode } = build();
    lobby.showHosting('https://example.com/?join=carrom-a1b2c3', 'carrom-a1b2c3');
    settle();

    input().value = '   ';
    button('Join').dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));

    expect(onJoinCode).not.toHaveBeenCalled();
  });

  it('ignores the click that opened the screen', () => {
    const { lobby, onJoinCode, onCancel } = build();
    lobby.showHosting('https://example.com/?join=carrom-a1b2c3', 'carrom-a1b2c3');

    // No settle(): this is the tail of the gesture that got here.
    input().value = 'd4e5f6';
    button('Join').dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
    button('← Back').dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));

    expect(onJoinCode).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('promises the link will work when the address can travel', () => {
    const { lobby } = build();
    lobby.showHosting('https://carrom.example.com/?join=carrom-a1b2c3', 'carrom-a1b2c3', true);
    expect(container.textContent).toContain('Send this link');
    expect(container.textContent).not.toContain('only exists on your own network');
  });

  it('says so when the address exists only on this machine', () => {
    const { lobby } = build();
    lobby.showHosting('http://172.16.30.98:5199/?join=carrom-a1b2c3', 'carrom-a1b2c3', false);
    expect(container.textContent).toContain('only exists on your own network');
    expect(container.textContent).not.toContain('Send this link');
  });

  it('hides the code box once already joining', () => {
    const { lobby } = build();
    lobby.showJoining();
    const box = input().parentElement as HTMLElement;
    expect(box.style.display).toBe('none');
  });
});
