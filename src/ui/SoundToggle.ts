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
  readonly #onChange: ((enabled: boolean) => void) | undefined;

  /**
   * @param onChange Called with the new state so it can be persisted. Without
   *   it the toggle changed the running game and nothing else — the preference
   *   was never written, so it could not survive a reload even though
   *   `SaveManager` had a field waiting for it.
   */
  constructor(
    container: HTMLElement,
    audio: AudioManager,
    onChange?: (enabled: boolean) => void,
  ) {
    this.#audio = audio;
    this.#onChange = onChange;

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
    const enabled = !this.#audio.settings.sfxEnabled;
    this.#audio.setSfxEnabled(enabled);
    this.#onChange?.(enabled);
    this.#render();
  };

  #render(): void {
    const on = this.#audio.settings.sfxEnabled;
    /*
     * Drawn, not an emoji.
     *
     * An emoji is a different typeface on every platform — sized, coloured
     * and vertically aligned by that platform, not by us. Next to four
     * hand-drawn marks it was the one control that looked borrowed, and on the
     * dark disc it rendered pale and flat.
     */
    this.#button.innerHTML = on ? SPEAKER_ON : SPEAKER_OFF;
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

/** Speaker with two waves. One stroke weight, matching the other marks. */
const SPEAKER_ON = `<svg viewBox="0 0 24 24" aria-hidden="true">
  <path d="M4 9.5h3.2L12 5.6v12.8L7.2 14.5H4z"/>
  <path d="M15.6 9.2a4 4 0 0 1 0 5.6"/>
  <path d="M18.2 6.6a7.6 7.6 0 0 1 0 10.8"/>
</svg>`;

/** The same speaker, struck through — the state, not a different object. */
const SPEAKER_OFF = `<svg viewBox="0 0 24 24" aria-hidden="true">
  <path d="M4 9.5h3.2L12 5.6v12.8L7.2 14.5H4z"/>
  <path d="M16 9.8l5 4.4M21 9.8l-5 4.4"/>
</svg>`;
