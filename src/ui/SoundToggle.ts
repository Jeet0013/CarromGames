/**
 * Sound on/off button.
 *
 * Small and corner-pinned so it never crosses the board. Provisional, like
 * `Notifications` — the settings screen absorbs it in the UI phase — but sound
 * that cannot be silenced is worse than no sound, particularly on a phone.
 */

import type { AudioManager } from '../audio/AudioManager';

import { injectBaseSheet } from './theme';

export class SoundToggle {
  readonly #button: HTMLButtonElement;
  readonly #audio: AudioManager;

  constructor(container: HTMLElement, audio: AudioManager) {
    this.#audio = audio;

    this.#button = document.createElement('button');
    this.#button.type = 'button';
    injectBaseSheet();
    this.#button.className = 'cx-icon-btn cx-focus';
    this.#button.style.cssText = [
      'position:absolute',
      'top:max(14px, env(safe-area-inset-top))',
      'right:max(14px, env(safe-area-inset-right))',
      'font-size:19px',
      'line-height:1',
      'z-index:40',
    ].join(';');

    this.#render();
    this.#button.addEventListener('click', this.#onClick);
    container.append(this.#button);
  }

  readonly #onClick = (event: MouseEvent): void => {
    // The canvas sits underneath; without this the tap also aims a shot.
    event.stopPropagation();
    this.#audio.setSfxEnabled(!this.#audio.settings.sfxEnabled);
    this.#render();
  };

  #render(): void {
    const on = this.#audio.settings.sfxEnabled;
    this.#button.textContent = on ? '🔊' : '🔇';
    this.#button.setAttribute('aria-label', on ? 'Mute sound' : 'Unmute sound');
    this.#button.style.opacity = on ? '1' : '0.55';
  }

  /** Hidden while a full-screen overlay is up, so it cannot sit over a menu. */
  setVisible(visible: boolean): void {
    this.#button.style.display = visible ? 'grid' : 'none';
  }

  dispose(): void {
    this.#button.removeEventListener('click', this.#onClick);
    this.#button.remove();
  }
}
