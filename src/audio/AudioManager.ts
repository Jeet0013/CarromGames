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

import applauseUrl from '../assets/applause.mp3';
import booUrl from '../assets/boo.mp3';
import { PieceKind } from '../core/types';
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
  // Two seconds rather than a few milliseconds: a very short loop restarts
  // constantly, and some iOS versions drop the media session between passes.
  const samples = 44100;
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

  /** Menu theme: rendered once into a buffer, then looped. */
  #menuBuffer: AudioBuffer | undefined;
  #menuSource: AudioBufferSourceNode | undefined;
  #menuGain: GainNode | undefined;
  #menuWanted = false;

  /** Crowd noise for the cheer, built once. */
  #crowdBuffer: AudioBuffer | undefined;

  readonly #settings: AudioSettings = {
    sfxEnabled: true,
    musicEnabled: true,
    masterVolume: 0.85,
  };

  constructor(events: EventBus) {
    events.on('physics:contact', ({ kind, impact, a, b }) => {
      if (kind === 'rail') this.playRailHit(impact);
      else this.playCoinHit(impact, a === 'striker' || b === 'striker');
    });

    /*
     * A pocket is two sounds, not one.
     *
     * `playPocket` is the physical event — the coin dropping through. The
     * crowd is the *judgement* of it, and the two are separate because they
     * are not always both true: the striker going down is a pocket and a
     * foul, and cheering it would be the game congratulating you for losing a
     * turn.
     *
     * `playCheer` already existed, written for exactly this and never wired to
     * anything.
     */
    events.on('pocket:scored', ({ kind }) => {
      // The crowd reacts to a coin, not to the striker going down — that is a
      // foul, and it gets the boo below instead.
      this.playPocket(kind !== PieceKind.Striker);
    });

    // Every foul the rules recognise, including the striker going down.
    events.on('rules:foul', () => this.playBoo());

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
    // The one mute control covers music too; a player silencing a game expects
    // silence, not a theme still playing underneath.
    if (!enabled) this.stopMenuMusic();
    else if (this.#menuWanted) this.startMenuMusic();
  }

  setMusicEnabled(enabled: boolean): void {
    this.#settings.musicEnabled = enabled;
    if (!enabled) this.stopMenuMusic();
    else if (this.#menuWanted) this.startMenuMusic();
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
      if (this.#menuWanted && !this.#menuSource) this.startMenuMusic();
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
      // The menu is usually already showing by the time audio unlocks.
      if (this.#menuWanted) this.startMenuMusic();
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
      const audio = document.createElement('audio');
      audio.src = SILENT_WAV;
      audio.loop = true;
      audio.volume = 0.02;
      audio.setAttribute('playsinline', '');
      audio.setAttribute('webkit-playsinline', '');
      audio.preload = 'auto';
      /*
       * Attached to the document, not held as a detached element.
       *
       * A detached `new Audio()` is a legal media element but iOS treats it
       * inconsistently — it can decline to start, or be collected — and a
       * silent track that is not actually playing does nothing at all. Since
       * the whole point is to hold the page in a media session so Web Audio
       * escapes the ring/silent switch, it has to be genuinely, verifiably
       * playing. In the DOM it is both.
       */
      audio.style.cssText = 'position:absolute;width:0;height:0;opacity:0;pointer-events:none';
      document.body.append(audio);
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
  /**
   * Decoded sample cache.
   *
   * Both clips arrive as data URIs — the build inlines every asset so the
   * single-file artifact stays self-contained — and are decoded once on first
   * use. Decoding is async and cannot happen before the context exists, so the
   * first play of each may be silent; every one after is immediate.
   */
  readonly #samples = new Map<string, AudioBuffer>();
  readonly #decoding = new Set<string>();

  #sample(context: AudioContext, url: string): AudioBuffer | undefined {
    const cached = this.#samples.get(url);
    if (cached) return cached;

    if (!this.#decoding.has(url)) {
      this.#decoding.add(url);
      void fetch(url)
        .then((response) => response.arrayBuffer())
        .then((data) => context.decodeAudioData(data))
        .then((buffer) => {
          this.#samples.set(url, buffer);
        })
        .catch(() => {
          // A clip that will not decode is not worth taking the game down for;
          // the rest of the sound design carries on without it.
        })
        .finally(() => this.#decoding.delete(url));
    }
    return undefined;
  }

  /**
   * Play a decoded clip, or nothing at all if it is not ready yet.
   *
   * @param level peak gain; these are recorded samples, so this is the only
   *   shaping they need beyond the fade already baked into the file.
   */
  #playSample(url: string, level: number): boolean {
    const context = this.#context;
    if (!context || !this.#master) return false;

    const buffer = this.#sample(context, url);
    if (!buffer) return false;

    const now = context.currentTime;
    const source = context.createBufferSource();
    source.buffer = buffer;

    const gain = context.createGain();
    gain.gain.value = level;

    source.connect(gain).connect(this.#master);
    source.start(now);
    this.#trackVoice(now + buffer.duration);
    return true;
  }

  #trackVoice(endsAt: number): void {
    this.#voiceEnds.push(endsAt);
  }

  // ── Menu theme ──────────────────────────────────────────────────────────

  /**
   * Render the menu loop into a buffer.
   *
   * Rendered once rather than scheduled note by note. A live scheduler would
   * need a lookahead timer running for as long as the menu is open, and would
   * drift if the tab is throttled; a buffer loops in the audio thread and costs
   * nothing to keep playing.
   *
   * The first version was a slow pluck over a drone: pleasant, but it set a
   * contemplative tone for a game about flicking discs across a board at speed.
   * This is built like a track instead — a kick and tabla-style pulse, a bass
   * on every beat, a shaker driving the eighths and a sixteenth-note figure
   * over the top at 116 BPM. The energy comes from the *rate* of events rather
   * than from volume, which is what keeps it lifting without becoming tiring.
   *
   * The harmony stays minor-modal and the line pentatonic: Carrom is an Indian
   * game, so that is the honest reference, and a minor mode drives where a
   * major key would turn saccharine over a loop.
   */
  #buildMenuLoop(context: AudioContext): AudioBuffer {
    const rate = context.sampleRate;
    const bpm = 116;
    const beat = 60 / bpm;
    const bars = 4;
    const seconds = beat * 4 * bars;
    const length = Math.floor(rate * seconds);

    const buffer = context.createBuffer(2, length, rate);
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);

    /**
     * Write a sample into both channels, wrapping past the end.
     *
     * The wrap is what makes the loop continuous. Notes near the end of the
     * last bar ring on past the buffer boundary, and truncating them left the
     * final beat almost silent — measured at 0.021 average against 0.301 just
     * after the loop point, a fourteenfold jump that reads as the music
     * stopping and restarting. Folding those tails back to the top is exactly
     * what would happen if the loop were simply played twice.
     */
    const add = (index: number, value: number, pan = 0.5): void => {
      const i = ((index % length) + length) % length;
      left[i] = (left[i] ?? 0) + value * pan;
      right[i] = (right[i] ?? 0) + value * (1 - pan);
    };

    /** A struck, decaying tone with a little harmonic bite. */
    const pluck = (at: number, freq: number, gain: number, decay: number, pan = 0.5): void => {
      const start = Math.floor(at * rate);
      const samples = Math.floor(decay * 3 * rate);
      for (let i = 0; i < samples; i += 1) {
        const time = i / rate;
        const env = Math.exp(-time / decay);
        const value =
          (Math.sin(2 * Math.PI * freq * time) +
            // The upper partials die fastest, which is what makes it read as
            // plucked rather than blown.
            0.45 * Math.exp(-time * 9) * Math.sin(2 * Math.PI * freq * 2 * time) +
            0.22 * Math.exp(-time * 16) * Math.sin(2 * Math.PI * freq * 3 * time)) *
          env *
          gain;
        add(start + i, value, pan);
      }
    };

    /** Kick: a pitch sweep, which is what gives a drum its thump. */
    const kick = (at: number, gain = 0.5): void => {
      const start = Math.floor(at * rate);
      const samples = Math.floor(0.28 * rate);
      for (let i = 0; i < samples; i += 1) {
        const time = i / rate;
        const freq = 46 + 105 * Math.exp(-time * 34);
        const env = Math.exp(-time * 11);
        add(start + i, Math.sin(2 * Math.PI * freq * time) * env * gain, 0.5);
      }
    };

    /** Tabla-like tap: a short pitched ring over a noise click. */
    const tap = (at: number, freq: number, gain: number, pan: number): void => {
      const start = Math.floor(at * rate);
      const samples = Math.floor(0.16 * rate);
      for (let i = 0; i < samples; i += 1) {
        const time = i / rate;
        const env = Math.exp(-time * 26);
        const body = Math.sin(2 * Math.PI * freq * time) * env;
        const click = (Math.random() * 2 - 1) * Math.exp(-time * 190) * 0.5;
        add(start + i, (body + click) * gain, pan);
      }
    };

    /** Shaker: filtered noise, very short — this is the part that drives. */
    const shaker = (at: number, gain: number, pan: number): void => {
      const start = Math.floor(at * rate);
      const samples = Math.floor(0.07 * rate);
      let previous = 0;
      for (let i = 0; i < samples; i += 1) {
        const time = i / rate;
        const noise = Math.random() * 2 - 1;
        // Crude high-pass: subtracting the running value keeps only the hiss.
        const filtered = noise - previous;
        previous = noise * 0.5 + previous * 0.5;
        add(start + i, filtered * Math.exp(-time * 62) * gain, pan);
      }
    };

    // ── Harmony ───────────────────────────────────────────────────────────
    // A minor-modal progression: darker and more driving than a major key, and
    // it keeps the pentatonic line from sounding like a lullaby.
    const root = 146.83; // D3
    const chordRoots = [1, 1.4983, 1.3348, 0.8909]; // D, A, G, C
    const scale = [1, 1.1225, 1.3348, 1.4983, 1.6818, 2, 2.245, 2.6697];

    for (let bar = 0; bar < bars; bar += 1) {
      const barStart = bar * beat * 4;
      const chord = chordRoots[bar] ?? 1;

      // Bass on every beat, driving the pulse.
      for (let b = 0; b < 4; b += 1) {
        pluck(barStart + b * beat, root * chord * 0.5, 0.2, 0.18, 0.5);
      }

      // Drums: kick on 1 and 3, taps on the off-beats, shaker on every eighth.
      for (let step = 0; step < 8; step += 1) {
        const at = barStart + step * (beat / 2);
        if (step === 0 || step === 4) kick(at, 0.55);
        if (step === 2 || step === 6) tap(at, 320, 0.3, 0.42);
        if (step % 2 === 1) tap(at, 620, 0.12, 0.6);
        shaker(at, step % 2 === 0 ? 0.1 : 0.055, step % 2 === 0 ? 0.35 : 0.65);
      }

      // Sixteenth-note melodic figure — the energy comes from the rate.
      const figure = [0, 2, 4, 5, 4, 2, 3, 1, 0, 2, 4, 7, 5, 4, 2, 0];
      for (let i = 0; i < 16; i += 1) {
        const degree = figure[(i + bar * 3) % figure.length] ?? 0;
        const at = barStart + i * (beat / 4);
        // Accent the downbeats so the run has shape rather than being a blur.
        const accent = i % 4 === 0 ? 0.115 : 0.062;
        pluck(at, root * chord * (scale[degree] ?? 1), accent, 0.1, i % 2 ? 0.62 : 0.38);
      }
    }

    /*
     * Soft limiting, driven hard.
     *
     * The first pass measured an RMS of 0.057 against a 0.438 peak — a crest
     * factor near 8, meaning the loop was mostly silence between transients and
     * would read as thin however far the volume was turned up. Driving into
     * tanh lifts the *average* level, which is what energy actually is, while
     * the curve keeps the peaks from clipping — a clipped loop sounds broken,
     * not loud.
     */
    for (let i = 0; i < length; i += 1) {
      left[i] = Math.tanh((left[i] ?? 0) * 2.6) * 0.9;
      right[i] = Math.tanh((right[i] ?? 0) * 2.6) * 0.9;
    }

    return buffer;
  }

  /**
   * Start the menu theme. Idempotent, and safe to call before audio unlocks.
   *
   * Before the first gesture the browser refuses to start audio at all, so this
   * only records the intent; `#unlock` starts it for real. That matters more
   * than it sounds: the first gesture a player makes is almost always the menu
   * card itself, so without the deferred start the theme would never be heard.
   */
  startMenuMusic(): void {
    this.#menuWanted = true;
    const context = this.#context;
    if (!context || !this.#master) return;
    if (!this.#settings.musicEnabled || !this.#settings.sfxEnabled) return;
    if (this.#menuSource) return;

    this.#menuBuffer ??= this.#buildMenuLoop(context);

    const gain = context.createGain();
    // Fade in: music that arrives at full level reads as a jingle, not a theme.
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(1.35, context.currentTime + 0.9);
    gain.connect(this.#master);

    const source = context.createBufferSource();
    source.buffer = this.#menuBuffer;
    source.loop = true;
    source.connect(gain);
    source.start();

    this.#menuSource = source;
    this.#menuGain = gain;
  }

  /**
   * Fade the theme out and stop it.
   *
   * Faded rather than cut: the music stops because a match is starting, and a
   * hard stop at that moment sounds like a fault rather than a transition.
   */
  stopMenuMusic(): void {
    this.#menuWanted = false;
    const context = this.#context;
    const source = this.#menuSource;
    const gain = this.#menuGain;
    if (!context || !source || !gain) return;

    const now = context.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.7);
    source.stop(now + 0.75);

    this.#menuSource = undefined;
    this.#menuGain = undefined;
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

  /**
   * UI click.
   *
   * Deliberately unlike the coin clack: a short, bright tick with almost no
   * body. A control that sounds like a piece of the game being struck would
   * make the menu feel like the board, and the two need to stay distinct.
   *
   * Bypasses the contact throttle — a tap that makes no sound reads as a tap
   * that did not register, which is exactly the doubt a click is there to
   * remove.
   */
  playClick(): void {
    if (!this.#settings.sfxEnabled) return;
    const context = this.#context;
    const master = this.#master;
    if (!context || !master) return;
    if (context.state === 'suspended') void context.resume();

    const now = context.currentTime;

    const osc = context.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(1750, now);
    osc.frequency.exponentialRampToValueAtTime(950, now + 0.03);

    const shape = context.createBiquadFilter();
    shape.type = 'bandpass';
    shape.frequency.value = 1900;
    shape.Q.value = 1.1;

    const gain = context.createGain();
    gain.gain.setValueAtTime(0.14, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.045);

    osc.connect(shape).connect(gain).connect(master);
    osc.start(now);
    osc.stop(now + 0.06);
    this.#trackVoice(now + 0.06);
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
  /**
   * A coin dropping through a pocket.
   *
   * @param celebrate Whether the crowd reacts. False for the striker, which is
   *   a foul — this cheered unconditionally before, so the game applauded a
   *   player for losing their turn.
   */
  playPocket(celebrate = true): void {
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

    if (celebrate) this.playCheer();
  }

  /**
   * Crowd noise for the cheer, built once.
   *
   * A crowd is not a sound effect, it is hundreds of uncorrelated voices, and
   * that is exactly what filtered noise with a slow random envelope sounds
   * like. Two independent channels keep it wide — mono noise collapses to a
   * hiss in the middle of the image and stops reading as people.
   */
  #buildCrowd(context: AudioContext): AudioBuffer {
    const rate = context.sampleRate;
    // 2.8s, up from 1.6. The cheer now runs a full two seconds and the boo
    // plays this back slowed, which consumes it faster than real time — a
    // shorter buffer ran out mid-envelope and the crowd cut off rather than
    // faded.
    const length = Math.floor(rate * 2.8);
    const buffer = context.createBuffer(2, length, rate);

    for (let channel = 0; channel < 2; channel += 1) {
      const data = buffer.getChannelData(channel);
      let flutter = 0;
      for (let i = 0; i < length; i += 1) {
        // A slow random walk over the noise gives the uneven swell of voices
        // rather than a flat wash.
        flutter += (Math.random() - 0.5) * 0.04;
        flutter = Math.max(-1, Math.min(1, flutter * 0.995));
        data[i] = (Math.random() * 2 - 1) * (0.55 + flutter * 0.45);
      }
    }
    return buffer;
  }

  /**
   * A cheer when a coin drops.
   *
   * Two layers, because either alone is wrong. A bare chime is clean but
   * bloodless — it tells you that you scored without making you feel it. A bare
   * crowd is a stadium, which a tabletop game is not. Together, the chime
   * carries the information and the crowd carries the reward, and the crowd is
   * mixed low and band-limited so it never buries the wooden clacks that are
   * still settling.
   */
  playCheer(): void {
    if (!this.#settings.sfxEnabled) return;
    const context = this.#context;
    if (!context || !this.#master) return;

    /*
     * The recorded applause, when it has decoded.
     *
     * The synthesised crowd below is not dead code — it is what plays on the
     * very first pocket of a session, before the clip has finished decoding,
     * and it is what plays if the file ever fails to decode at all. A game
     * that goes silent because an asset did not load is worse than one that
     * falls back to something built from an oscillator.
     */
    if (this.#playSample(applauseUrl, 0.85)) {
      this.#playChime(context, this.#master, context.currentTime);
      return;
    }

    // Captured locally: TypeScript cannot narrow a private field across the
    // closure below, and the field is optional until audio unlocks.
    const master = this.#master;
    const now = context.currentTime;
    // ── Crowd swell ───────────────────────────────────────────────────────
    this.#crowdBuffer ??= this.#buildCrowd(context);
    const crowd = context.createBufferSource();
    crowd.buffer = this.#crowdBuffer;

    // Band-limited to the range voices actually occupy: below this it muddies
    // the board resonance, above it hisses.
    const bandpass = context.createBiquadFilter();
    bandpass.type = 'bandpass';
    bandpass.frequency.value = 1150;
    bandpass.Q.value = 0.75;

    const crowdGain = context.createGain();
    /*
     * Two seconds, and roughly twice as loud as it was.
     *
     * It ran 1.35s at 0.16 gain, under a chime, band-limited — audible in a
     * quiet room and inaudible on a phone at arm's length, which is where this
     * game is played. It swells, holds through the applause, and falls away.
     */
    crowdGain.gain.setValueAtTime(0.0001, now);
    crowdGain.gain.exponentialRampToValueAtTime(0.34, now + 0.14);
    crowdGain.gain.setValueAtTime(0.34, now + 1.15);
    crowdGain.gain.exponentialRampToValueAtTime(0.0001, now + 2.0);

    crowd.connect(bandpass).connect(crowdGain).connect(master);
    crowd.start(now);
    crowd.stop(now + 2.05);
    this.#trackVoice(now + 2.05);

    // The claps themselves. Without these the crowd is a wash of voices; a
    // clap is a transient, and applause is a lot of transients at once.
    this.#playApplause(context, master, now);

    this.#playChime(context, master, now);
  }

  /**
   * A rising major triad over the applause.
   *
   * Kept when the recorded crowd took over: the clip says a lot of people
   * approved, the chime says *you scored*, and they are different pieces of
   * information. It is also the part that cuts through on a phone speaker,
   * where a broadband crowd recording loses most of its body.
   */
  #playChime(context: AudioContext, master: AudioNode, now: number): void {
    // Root, major third, fifth — arpeggiated upward.
    for (const [index, frequency] of [523.25, 659.25, 783.99].entries()) {
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
    }
  }

  /** True when audio exists and is actually running. Surfaced in the UI. */
  get isRunning(): boolean {
    return this.#context?.state === 'running';
  }

  /**
   * The crowd's disapproval.
   *
   * Built from the same crowd buffer as the cheer, which is what makes them
   * recognisably the same room. Three things separate them:
   *
   * - **Low-passed, not band-passed.** A boo lives in the chest, a cheer in
   *   the head. Rolling off everything above 700 Hz is most of the character.
   * - **It sags.** A downward pitch bend on the playback rate, because a boo
   *   is a held vowel that loses support, where a cheer rises.
   * - **It starts immediately.** A crowd takes a moment to celebrate and no
   *   time at all to groan.
   *
   * Mixed below the cheer on purpose: this fires on every foul, including the
   * common ones, and a punishment sound that is louder than the reward gets
   * old inside one match.
   */
  /**
   * Individual claps, scattered across the cheer.
   *
   * A crowd swell is voices; applause is hands, and hands are transients. Each
   * clap is a very short noise burst through a high bandpass — the crack of
   * two palms, with no tail.
   *
   * They are dense at the front and thin out, which is what a real crowd does:
   * everyone starts together and then falls out of step. The timing is jittered
   * so no two claps land on the same instant, because a grid of them reads as a
   * machine.
   */
  #playApplause(context: AudioContext, master: AudioNode, now: number): void {
    const CLAPS = 34;
    const SPAN = 1.7;

    for (let i = 0; i < CLAPS; i += 1) {
      // Squared, so the density falls off rather than spreading evenly.
      const progress = (i / CLAPS) ** 0.55;
      const at = now + 0.04 + progress * SPAN + Math.random() * 0.05;

      const burst = this.#noise(context);
      const band = context.createBiquadFilter();
      band.type = 'bandpass';
      // Each pair of hands is a slightly different size.
      band.frequency.value = 1500 + Math.random() * 2200;
      band.Q.value = 0.9;

      const gain = context.createGain();
      // Later claps are quieter: the crowd is winding down, not stopping dead.
      const level = 0.16 * (1 - progress * 0.55) * (0.6 + Math.random() * 0.4);
      gain.gain.setValueAtTime(level, at);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.05);

      burst.connect(band).connect(gain).connect(master);
      burst.start(at);
      burst.stop(at + 0.06);
    }

    this.#trackVoice(now + SPAN + 0.2);
  }

  playBoo(): void {
    if (!this.#settings.sfxEnabled) return;
    const context = this.#context;
    if (!context || !this.#master) return;

    // The recording, falling back to the synthesised crowd until it decodes.
    if (this.#playSample(booUrl, 0.8)) return;

    const master = this.#master;
    const now = context.currentTime;

    this.#crowdBuffer ??= this.#buildCrowd(context);
    const crowd = context.createBufferSource();
    crowd.buffer = this.#crowdBuffer;
    // Slower playback drops the whole crowd into a lower register; the ramp
    // is the sag.
    crowd.playbackRate.setValueAtTime(0.82, now);
    crowd.playbackRate.linearRampToValueAtTime(0.66, now + 0.9);

    const lowpass = context.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 700;
    lowpass.Q.value = 0.6;

    // A shallow dip around 2 kHz takes the last of the hiss out, so it reads
    // as voices in a room rather than filtered noise.
    const notch = context.createBiquadFilter();
    notch.type = 'peaking';
    notch.frequency.value = 2000;
    notch.gain.value = -8;

    const gain = context.createGain();
    // 1.8s and more than twice the level it started at — still under the
    // cheer, because this fires on every foul and a punishment that shouts
    // gets old inside one match.
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.26, now + 0.06);
    gain.gain.setValueAtTime(0.26, now + 1.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.8);

    crowd.connect(lowpass).connect(notch).connect(gain).connect(master);
    crowd.start(now);
    crowd.stop(now + 1.85);
    this.#trackVoice(now + 1.85);
  }

  dispose(): void {
    this.stopMenuMusic();
    this.#silentTrack?.pause();
    this.#silentTrack = undefined;
    void this.#context?.close();
    this.#context = undefined;
    this.#master = undefined;
  }
}
