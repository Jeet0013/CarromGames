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
/**
 * A fraction of a second of silence as a WAV data URI.
 *
 * Built by hand rather than shipped as a file: 44-byte RIFF header plus a
 * handful of zero samples, which keeps the no-binary-assets rule intact.
 */
const SILENT_WAV = (() => {
  const samples = 1000;
  const bytes = new Uint8Array(44 + samples * 2);
  const view = new DataView(bytes.buffer);
  const ascii = (offset: number, text: string): void => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
  };
  ascii(0, 'RIFF');
  view.setUint32(4, 36 + samples * 2, true);
  ascii(8, 'WAVEfmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, 22050, true);
  view.setUint32(28, 22050 * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, 'data');
  view.setUint32(40, samples * 2, true);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:audio/wav;base64,${btoa(binary)}`;
})();

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
  /** Silent loop that keeps iOS in a media session. See `#primeSilentTrack`. */
  #silentTrack: HTMLAudioElement | undefined;

  readonly #settings: AudioSettings = {
    sfxEnabled: true,
    musicEnabled: true,
    masterVolume: 0.7,
  };

  constructor(events: EventBus) {
    events.on('physics:contact', ({ kind, impact, a, b }) => {
      if (kind === 'rail') this.playRailHit(impact);
      else this.playCoinHit(impact, a === 'striker' || b === 'striker');
    });

    events.on('pocket:scored', () => this.playPocket());

    /*
     * Browsers refuse to start audio without a user gesture.
     *
     * Listeners are NOT `once`, and are attached in the capture phase. Several
     * UI controls call `stopPropagation` so a tap does not also aim a shot, and
     * a bubbling listener on `window` would never see those taps — on a phone,
     * where the first interaction is very often a menu card, that alone can
     * leave the game silent for the whole session. Capture runs before the
     * target, so nothing can suppress it.
     *
     * They stay attached because iOS can suspend the context again later
     * (after a call, a background, a route change); `#unlock` is cheap and
     * idempotent, and re-running it is what recovers the audio.
     */
    const unlock = (): void => this.#unlock();
    for (const type of ['pointerdown', 'touchstart', 'touchend', 'click', 'keydown']) {
      window.addEventListener(type, unlock, { capture: true, passive: true });
    }

    // Returning from the background leaves the context suspended on iOS.
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) void this.#context?.resume();
    });
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

  /**
   * Create or revive the audio context. Safe to call on every gesture.
   *
   * Not guarded by a one-shot flag any more: iOS suspends the context on its
   * own, and the only legal moment to resume it is inside a user gesture — so
   * every gesture gets a chance to put it back.
   */
  #unlock(): void {
    if (this.#context) {
      // Already built; it may simply have been suspended out from under us.
      if (this.#context.state === 'suspended') void this.#context.resume();
      this.#primeSilentTrack();
      return;
    }
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
      this.#primeSilentTrack();
    } catch (error) {
      // Audio is a nicety; never let its absence break the game.
      console.warn('[AudioManager] audio unavailable:', error);
    }
  }

  /**
   * Keep a silent looping track playing.
   *
   * On iOS the hardware ring/silent switch mutes Web Audio, which is the single
   * most common reason a game is silent on an iPhone while working everywhere
   * else. An `<audio>` element in playback puts the page in a media session,
   * which in most iOS versions lifts Web Audio out of the muted category.
   *
   * It is a workaround, not a guarantee — some iOS versions still honour the
   * switch — but it costs nothing and fixes the majority case. The buffer is a
   * generated silent WAV, so no asset ships.
   */
  #primeSilentTrack(): void {
    if (this.#silentTrack) {
      if (this.#silentTrack.paused) void this.#silentTrack.play().catch(() => {});
      return;
    }
    try {
      const audio = new Audio(SILENT_WAV);
      audio.loop = true;
      audio.volume = 0.001;
      // Marks this as media rather than an incidental sound effect.
      audio.setAttribute('playsinline', '');
      void audio.play().catch(() => {});
      this.#silentTrack = audio;
    } catch {
      // Non-fatal: the game is simply as loud as iOS allows.
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

    // A context that has drifted back to suspended produces silence without
    // any error; nudging it here is what keeps sound alive across a long match.
    if (context.state === 'suspended') void context.resume();

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
   * Coin-on-coin, or the striker driving into the pack.
   *
   * ## Why modal synthesis rather than an oscillator
   *
   * A struck wooden disc does not produce a pitch. It rings in several modes at
   * once, at frequencies that are *not* harmonic multiples, and each mode decays
   * at its own rate — the high ones die first, which is what makes a wooden
   * clack sound bright at the very start and hollow a moment later.
   *
   * The first version used one triangle oscillator with an exponential decay.
   * That is a single harmonic pitch, and it reads as a plastic click no matter
   * how the envelope is shaped. Three inharmonic partials at roughly 1 : 2.4 :
   * 4.1 — close to the mode ratios of a stiff disc — plus a noise transient for
   * the initial contact and a low board resonance underneath, is what actually
   * sounds like wood on wood.
   *
   * Real coins also never sound *identical* twice, because they are struck at
   * slightly different points. A small random detune per hit prevents the
   * machine-gun sameness a fixed pitch gives during a scatter.
   */
  playCoinHit(impact: number, involvesStriker = false): void {
    const context = this.#canPlay();
    if (!context || !this.#master) return;

    const strength = Math.min(1, impact / (PHYSICS_CONFIG.MAX_VELOCITY * 0.6));
    if (strength < 0.02) return;

    const now = context.currentTime;
    const volume = 0.05 + strength * 0.3;

    // The striker is larger and heavier than a coin, so it rings lower.
    const base = (involvesStriker ? 430 : 660) * (0.92 + Math.random() * 0.16);

    // Mode ratios and per-mode decay. Higher modes fade fastest, as in wood.
    const modes: Array<[ratio: number, gain: number, decay: number]> = [
      [1, 1, 0.13],
      [2.41, 0.55, 0.075],
      [4.12, 0.28, 0.042],
    ];

    let longest = 0;
    for (const [ratio, modeGain, modeDecay] of modes) {
      const decay = modeDecay * (0.75 + strength * 0.45);
      longest = Math.max(longest, decay);

      const osc = context.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(base * ratio, now);
      // Slight downward glide: the disc detunes as the strike energy dissipates.
      osc.frequency.exponentialRampToValueAtTime(base * ratio * 0.97, now + decay);

      const gain = context.createGain();
      gain.gain.setValueAtTime(volume * modeGain, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + decay);

      osc.connect(gain).connect(this.#master);
      osc.start(now);
      osc.stop(now + decay + 0.01);
    }

    // Contact transient — the click of two edges meeting, before anything rings.
    const noise = this.#noise(context);
    const bandpass = context.createBiquadFilter();
    bandpass.type = 'bandpass';
    bandpass.frequency.value = 2200 + strength * 2600;
    bandpass.Q.value = 0.9;
    const noiseGain = context.createGain();
    noiseGain.gain.setValueAtTime(volume * 0.5, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.016);
    noise.connect(bandpass).connect(noiseGain).connect(this.#master);
    noise.start(now);
    noise.stop(now + 0.03);

    // The plywood board resonating under the strike. Quiet, but it is the
    // difference between coins in mid-air and coins on a table.
    const body = context.createOscillator();
    body.type = 'sine';
    body.frequency.setValueAtTime(168 + strength * 40, now);
    const bodyGain = context.createGain();
    bodyGain.gain.setValueAtTime(volume * 0.34, now);
    bodyGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.11);
    body.connect(bodyGain).connect(this.#master);
    body.start(now);
    body.stop(now + 0.13);

    this.#trackVoice(now + Math.max(longest, 0.13) + 0.02);
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

    this.playCheer();
  }

  /**
   * A short rising chime after a pocket.
   *
   * Recorded crowd noise would be wrong here — this is a tabletop game, not a
   * stadium, and a canned cheer on every coin becomes grating within a minute.
   * A three-note major arpeggio reads as *reward* rather than applause: it is
   * brief, it rises, and because it is harmonically consonant it sits under the
   * wooden clacks instead of fighting them.
   */
  playCheer(): void {
    if (!this.#settings.sfxEnabled) return;
    const context = this.#context;
    if (!context || !this.#master) return;

    // Captured locally: TypeScript cannot narrow a private field across the
    // closure below, and the field is optional until audio unlocks.
    const master = this.#master;
    const now = context.currentTime;
    // Root, major third, fifth — a plain major triad, arpeggiated upward.
    const notes = [523.25, 659.25, 783.99];

    notes.forEach((frequency, index) => {
      const start = now + 0.16 + index * 0.075;
      const duration = 0.3;

      const osc = context.createOscillator();
      // Triangle rather than sine: a little more harmonic content so it carries
      // over the board resonance without needing to be loud.
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(frequency, start);

      const gain = context.createGain();
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.13, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

      osc.connect(gain).connect(master);
      osc.start(start);
      osc.stop(start + duration + 0.02);
      this.#trackVoice(start + duration + 0.02);
    });
  }

  /** True when audio exists and is actually running. Surfaced in the UI. */
  get isRunning(): boolean {
    return this.#context?.state === 'running';
  }

  dispose(): void {
    this.#silentTrack?.pause();
    this.#silentTrack = undefined;
    void this.#context?.close();
    this.#context = undefined;
    this.#master = undefined;
  }
}
