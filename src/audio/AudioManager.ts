/**
 * Sound effects, synthesised at runtime.
 *
 * Every sound is generated with the Web Audio API rather than loaded from
 * files. Three reasons that is the right call here:
 *
 * 1. **Nothing to download.** Carrom hits are short percussive transients —
 *    cheap to synthesise, and a set of samples would be hundreds of kilobytes
 *    for sounds lasting 60 ms.
 * 2. **Impact-responsive.** A real coin struck hard is louder *and brighter*
 *    than one nudged. A sample can only change volume; synthesis lets pitch,
 *    filter cutoff, and decay all follow the collision speed, which is what
 *    makes the board sound physical rather than looped.
 * 3. **Self-contained**, so the single-file build stays playable anywhere.
 *
 * A pure observer: it subscribes to physics and pocket events and never calls
 * into the rules.
 */

import type { EventBus } from '../core/EventBus';
import { PHYSICS_CONFIG } from '../physics/PhysicsConfig';

/**
 * Contacts are throttled.
 *
 * A break shot can produce dozens of contacts inside a few frames; playing all
 * of them turns a satisfying clack into a buzz, and stacking that many gain
 * nodes clips the master output.
 */
const MIN_GAP_MS = 28;
const MAX_CONCURRENT = 6;

export interface AudioSettings {
  sfxEnabled: boolean;
  musicEnabled: boolean;
  masterVolume: number;
}

export class AudioManager {
  #context: AudioContext | undefined;
  #master: GainNode | undefined;
  /** Shared noise used for the strike transient; built once. */
  #noiseBuffer: AudioBuffer | undefined;

  #lastPlayed = 0;
  /**
   * Scheduled end time of each live voice, in AudioContext time.
   *
   * Counting voices by incrementing on start and decrementing in an `ended`
   * listener looks simpler, and was the first attempt — but if `ended` fails to
   * fire even once the count only ever rises, and past the concurrency cap all
   * sound stops permanently with no way to recover. Testing caught exactly
   * that: a flood of contacts produced zero voices because the counter had
   * leaked to its ceiling. End times cannot leak: a voice is live only while
   * the clock says so.
   */
  readonly #voiceEnds: number[] = [];
  #unlocked = false;

  readonly #settings: AudioSettings = {
    sfxEnabled: true,
    musicEnabled: true,
    masterVolume: 0.7,
  };

  constructor(events: EventBus) {
    events.on('physics:contact', ({ kind, impact }) => {
      if (kind === 'rail') this.playRailHit(impact);
      else this.playCoinHit(impact);
    });

    events.on('pocket:scored', () => this.playPocket());

    // Browsers refuse to start audio without a user gesture. Rather than
    // failing silently on the first shot, the context is created on the first
    // interaction of any kind and the listeners then removed.
    const unlock = (): void => this.#unlock();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    window.addEventListener('touchstart', unlock, { once: true });
  }

  get settings(): Readonly<AudioSettings> {
    return this.#settings;
  }

  setSfxEnabled(enabled: boolean): void {
    this.#settings.sfxEnabled = enabled;
  }

  setMusicEnabled(enabled: boolean): void {
    this.#settings.musicEnabled = enabled;
  }

  setMasterVolume(volume: number): void {
    this.#settings.masterVolume = Math.min(1, Math.max(0, volume));
    if (this.#master) this.#master.gain.value = this.#settings.masterVolume;
  }

  /** Create the context. Safe to call repeatedly. */
  #unlock(): void {
    if (this.#unlocked) return;
    this.#unlocked = true;

    try {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctor) return;

      const context = new Ctor();
      const master = context.createGain();
      master.gain.value = this.#settings.masterVolume;
      master.connect(context.destination);

      this.#context = context;
      this.#master = master;
      // Safari can hand back a suspended context even after a gesture.
      void context.resume();
    } catch (error) {
      // Audio is a nicety; never let its absence break the game.
      console.warn('[AudioManager] audio unavailable:', error);
    }
  }

  /** Drop voices whose scheduled end has passed, and report how many remain. */
  #liveVoices(context: AudioContext): number {
    const now = context.currentTime;
    for (let i = this.#voiceEnds.length - 1; i >= 0; i -= 1) {
      const end = this.#voiceEnds[i];
      if (end === undefined || end <= now) this.#voiceEnds.splice(i, 1);
    }
    return this.#voiceEnds.length;
  }

  /** Reject a sound if muted, too soon, or too many are already playing. */
  #canPlay(): AudioContext | null {
    if (!this.#settings.sfxEnabled) return null;
    const context = this.#context;
    if (!context || !this.#master) return null;

    const now = performance.now();
    if (now - this.#lastPlayed < MIN_GAP_MS) return null;
    if (this.#liveVoices(context) >= MAX_CONCURRENT) return null;

    this.#lastPlayed = now;
    return context;
  }

  /** One-shot white noise, for the attack transient of a strike. */
  #noise(context: AudioContext): AudioBufferSourceNode {
    if (!this.#noiseBuffer) {
      const length = Math.floor(context.sampleRate * 0.12);
      const buffer = context.createBuffer(1, length, context.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
      this.#noiseBuffer = buffer;
    }
    const source = context.createBufferSource();
    source.buffer = this.#noiseBuffer;
    return source;
  }

  /** Record when a voice is scheduled to stop. */
  #trackVoice(endsAt: number): void {
    this.#voiceEnds.push(endsAt);
  }

  /**
   * Coin-on-coin or striker-on-coin: a sharp wooden "tok".
   *
   * Two layers — a filtered noise transient for the attack, and a short
   * triangle body for the pitch. Harder hits are brighter and slightly higher,
   * which is how the ear judges force.
   */
  playCoinHit(impact: number): void {
    const context = this.#canPlay();
    if (!context || !this.#master) return;

    const strength = Math.min(1, impact / (PHYSICS_CONFIG.MAX_VELOCITY * 0.6));
    if (strength < 0.02) return;

    const now = context.currentTime;
    const volume = 0.06 + strength * 0.3;
    const decay = 0.05 + strength * 0.03;

    // Attack transient.
    const noise = this.#noise(context);
    const noiseFilter = context.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = 1600 + strength * 2400;
    noiseFilter.Q.value = 1.2;
    const noiseGain = context.createGain();
    noiseGain.gain.setValueAtTime(volume * 0.7, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + decay * 0.6);
    noise.connect(noiseFilter).connect(noiseGain).connect(this.#master);
    noise.start(now);
    noise.stop(now + decay);
    this.#trackVoice(now + decay);

    // Pitched body.
    const osc = context.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(520 + strength * 460, now);
    osc.frequency.exponentialRampToValueAtTime(300, now + decay);
    const oscGain = context.createGain();
    oscGain.gain.setValueAtTime(volume, now);
    oscGain.gain.exponentialRampToValueAtTime(0.0001, now + decay);
    osc.connect(oscGain).connect(this.#master);
    osc.start(now);
    osc.stop(now + decay + 0.02);
    this.#trackVoice(now + decay + 0.02);
  }

  /** Rail hit: lower and duller — the frame absorbs the high end. */
  playRailHit(impact: number): void {
    const context = this.#canPlay();
    if (!context || !this.#master) return;

    const strength = Math.min(1, impact / (PHYSICS_CONFIG.MAX_VELOCITY * 0.6));
    if (strength < 0.04) return;

    const now = context.currentTime;
    const volume = 0.05 + strength * 0.22;
    const decay = 0.09 + strength * 0.05;

    const osc = context.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(190 + strength * 130, now);
    osc.frequency.exponentialRampToValueAtTime(90, now + decay);

    const lowpass = context.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 900;

    const gain = context.createGain();
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + decay);

    osc.connect(lowpass).connect(gain).connect(this.#master);
    osc.start(now);
    osc.stop(now + decay + 0.02);
    this.#trackVoice(now + decay + 0.02);
  }

  /**
   * Pocket: a falling pitch and a soft landing thud.
   *
   * Deliberately exempt from the contact throttle — several coins can drop in
   * one shot and each deserves to be heard, since it is the moment the player
   * is actually waiting for.
   */
  playPocket(): void {
    if (!this.#settings.sfxEnabled) return;
    const context = this.#context;
    if (!context || !this.#master) return;

    const now = context.currentTime;

    // Descending glide — the sound of something dropping away.
    const osc = context.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(660, now);
    osc.frequency.exponentialRampToValueAtTime(180, now + 0.22);

    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.26, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);

    osc.connect(gain).connect(this.#master);
    osc.start(now);
    osc.stop(now + 0.34);
    this.#trackVoice(now + 0.34);

    // Landing thud, a beat later.
    const thud = context.createOscillator();
    thud.type = 'sine';
    thud.frequency.setValueAtTime(120, now + 0.16);
    thud.frequency.exponentialRampToValueAtTime(64, now + 0.34);

    const thudGain = context.createGain();
    thudGain.gain.setValueAtTime(0.0001, now + 0.16);
    thudGain.gain.exponentialRampToValueAtTime(0.2, now + 0.18);
    thudGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);

    thud.connect(thudGain).connect(this.#master);
    thud.start(now + 0.16);
    thud.stop(now + 0.42);
    this.#trackVoice(now + 0.42);
  }

  dispose(): void {
    void this.#context?.close();
    this.#context = undefined;
    this.#master = undefined;
  }
}
