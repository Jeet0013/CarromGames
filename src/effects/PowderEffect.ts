/**
 * Powder on the board.
 *
 * A pale sheen laid over the playing surface that fades as the powder wears
 * off, a puff of dust when it is scattered, and a trail kicked up behind the
 * striker as it runs. All three are driven by the physics world's own powder
 * level, so what the player sees and what the coins feel can never disagree.
 *
 * The trail is the one that says *why* the shot is behaving oddly. A powdered
 * board makes the striker hold its pace through two rails, which without a cue
 * just looks like the physics being generous. Dust coming off it says the
 * board is slick — the same information, arriving as something seen rather
 * than something inferred.
 */

import * as THREE from 'three';

import { BOARD_CONFIG } from '../board/BoardConfig';

const PUFF_PARTICLES = 40;
const PUFF_SECONDS = 1.4;

/**
 * The trail behind a moving striker.
 *
 * A ring buffer: emitting overwrites the oldest particle rather than growing,
 * so a long shot costs exactly the same as a short one and there is nothing to
 * allocate inside the frame loop.
 */
const TRAIL_PARTICLES = 90;
/** How long one speck hangs before it has faded out. */
const TRAIL_SECONDS = 0.55;
/**
 * Below this the striker is rolling to a stop, and dust off a nearly-stopped
 * piece reads as smoke from a fire rather than powder off a board.
 */
const TRAIL_MIN_SPEED = 2.2;
/** Specks per second at full tilt. Scaled by speed and by powder remaining. */
const TRAIL_RATE = 90;

/**
 * The burn: a hotter, heavier trail that only appears at real speed.
 *
 * Fire on a carrom striker is not physics, it is emphasis — the same licence a
 * racing game takes with speed lines. It earns its place because a powdered
 * board's whole point is that the striker keeps going, and without a cue that
 * reads as the simulation being lenient rather than as the board being slick.
 *
 * Deliberately NOT additive. The bed is pale tan, and additive blending
 * disappears against a light background — the brighter the surface the less an
 * additive particle adds. So these are opaque specks that start bright amber
 * and cool through ember red to dark smoke grey, all of which have contrast
 * against tan.
 */
const BURN_PARTICLES = 70;
const BURN_SECONDS = 0.75;
/** Well above the dust threshold: this is for a shot that is genuinely quick. */
const BURN_MIN_SPEED = 8;
const BURN_RATE = 70;

export class PowderEffect {
  readonly #group = new THREE.Group();
  readonly #sheen: THREE.Mesh;
  readonly #puff: THREE.Points;
  readonly #positions: Float32Array;
  readonly #velocities: Float32Array;
  readonly #trail: THREE.Points;
  readonly #burn: THREE.Points;
  readonly #burnPositions: Float32Array;
  readonly #burnColors: Float32Array;
  readonly #burnLife: Float32Array;
  #burnNext = 0;
  #burnBudget = 0;
  readonly #trailPositions: Float32Array;
  /** Seconds of life left per speck; 0 means the slot is free. */
  readonly #trailLife: Float32Array;
  #trailNext = 0;
  #trailBudget = 0;
  readonly #disposables: Array<THREE.BufferGeometry | THREE.Material | THREE.Texture> = [];
  #puffElapsed = PUFF_SECONDS;

  constructor() {
    this.#group.name = 'PowderEffect';

    // ── Sheen over the surface ────────────────────────────────────────────
    const size = BOARD_CONFIG.surface.size;
    const geometry = new THREE.PlaneGeometry(size, size);
    geometry.rotateX(-Math.PI / 2);

    const material = new THREE.MeshBasicMaterial({
      map: this.#dustTexture(),
      color: 0xfff6e6,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.#sheen = new THREE.Mesh(geometry, material);
    // Just above the wood, below the pieces, so coins still sit on top of it.
    this.#sheen.position.y = 0.004;
    this.#sheen.renderOrder = 5;
    this.#group.add(this.#sheen);
    this.#disposables.push(geometry, material);

    // ── Dust puff ─────────────────────────────────────────────────────────
    this.#positions = new Float32Array(PUFF_PARTICLES * 3);
    this.#velocities = new Float32Array(PUFF_PARTICLES * 3);
    for (let i = 0; i < PUFF_PARTICLES; i += 1) this.#positions[i * 3 + 1] = -999;

    const puffGeometry = new THREE.BufferGeometry();
    puffGeometry.setAttribute('position', new THREE.BufferAttribute(this.#positions, 3));
    const puffMaterial = new THREE.PointsMaterial({
      size: 0.22,
      map: this.#dustTexture(),
      color: 0xfff4e2,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.#puff = new THREE.Points(puffGeometry, puffMaterial);
    this.#puff.frustumCulled = false;
    this.#group.add(this.#puff);
    this.#disposables.push(puffGeometry, puffMaterial);

    // ── Striker trail ─────────────────────────────────────────────────────
    this.#trailPositions = new Float32Array(TRAIL_PARTICLES * 3);
    this.#trailLife = new Float32Array(TRAIL_PARTICLES);
    // Park every speck under the board until it is first used, so the initial
    // frame does not show a cluster of dust at the origin.
    for (let i = 0; i < TRAIL_PARTICLES; i += 1) this.#trailPositions[i * 3 + 1] = -999;

    const trailGeometry = new THREE.BufferGeometry();
    trailGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(this.#trailPositions, 3),
    );

    const trailMaterial = new THREE.PointsMaterial({
      // Smaller than the scatter puff: this is what a coin kicks up, not a
      // handful thrown across the board.
      size: 0.13,
      map: this.#dustTexture(),
      color: 0xfff8ec,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.#trail = new THREE.Points(trailGeometry, trailMaterial);
    this.#trail.frustumCulled = false;
    this.#group.add(this.#trail);
    this.#disposables.push(trailGeometry, trailMaterial);

    // ── Burn ──────────────────────────────────────────────────────────────
    this.#burnPositions = new Float32Array(BURN_PARTICLES * 3);
    this.#burnColors = new Float32Array(BURN_PARTICLES * 3);
    this.#burnLife = new Float32Array(BURN_PARTICLES);
    for (let i = 0; i < BURN_PARTICLES; i += 1) this.#burnPositions[i * 3 + 1] = -999;

    const burnGeometry = new THREE.BufferGeometry();
    burnGeometry.setAttribute('position', new THREE.BufferAttribute(this.#burnPositions, 3));
    // Per-particle colour is what lets one system be fire at its head and
    // smoke at its tail without a shader.
    burnGeometry.setAttribute('color', new THREE.BufferAttribute(this.#burnColors, 3));

    const burnMaterial = new THREE.PointsMaterial({
      size: 0.2,
      map: this.#dustTexture(),
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
    });

    this.#burn = new THREE.Points(burnGeometry, burnMaterial);
    this.#burn.frustumCulled = false;
    this.#group.add(this.#burn);
    this.#disposables.push(burnGeometry, burnMaterial);
  }

  get group(): THREE.Group {
    return this.#group;
  }

  /** Soft mottled dust, generated so the game still ships no image assets. */
  #dustTexture(): THREE.Texture {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, size, size);
      // Scattered soft blobs read as powder; a flat wash reads as fog.
      for (let i = 0; i < 240; i += 1) {
        const x = Math.random() * size;
        const y = Math.random() * size;
        const r = 1.5 + Math.random() * 5;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, 'rgba(255,255,255,0.5)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    const texture = new THREE.CanvasTexture(canvas);
    this.#disposables.push(texture);
    return texture;
  }

  /** Puff of dust at the moment powder is scattered. */
  burst(): void {
    this.#puffElapsed = 0;
    const half = BOARD_CONFIG.halfSurface * 0.8;
    for (let i = 0; i < PUFF_PARTICLES; i += 1) {
      this.#positions[i * 3] = (Math.random() * 2 - 1) * half;
      this.#positions[i * 3 + 1] = 0.25 + Math.random() * 0.5;
      this.#positions[i * 3 + 2] = (Math.random() * 2 - 1) * half;
      this.#velocities[i * 3] = (Math.random() - 0.5) * 0.5;
      this.#velocities[i * 3 + 1] = -0.35 - Math.random() * 0.3;
      this.#velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.5;
    }
    this.#puff.geometry.getAttribute('position').needsUpdate = true;
  }

  /**
   * @param level   0–1 powder remaining, taken from the physics world.
   * @param striker Where the striker is and how fast, or null when it is not
   *   in play. Dust is only kicked up while there is powder to kick.
   */
  update(
    delta: number,
    level: number,
    striker: { readonly x: number; readonly z: number; readonly speed: number } | null = null,
  ): void {
    this.#updateTrail(delta, level, striker);
    this.#updateBurn(delta, level, striker);
    // Peak opacity is deliberately low — this is a dusting, not a snowfall.
    (this.#sheen.material as THREE.MeshBasicMaterial).opacity = level * 0.16;
    this.#sheen.visible = level > 0.002;

    if (this.#puffElapsed >= PUFF_SECONDS) {
      this.#puff.visible = false;
      return;
    }

    this.#puff.visible = true;
    this.#puffElapsed += delta;

    const p = this.#positions;
    const v = this.#velocities;
    for (let i = 0; i < PUFF_PARTICLES; i += 1) {
      const o = i * 3;
      p[o] = (p[o] ?? 0) + (v[o] ?? 0) * delta;
      p[o + 1] = Math.max(0.01, (p[o + 1] ?? 0) + (v[o + 1] ?? 0) * delta);
      p[o + 2] = (p[o + 2] ?? 0) + (v[o + 2] ?? 0) * delta;
    }

    const fade = 1 - this.#puffElapsed / PUFF_SECONDS;
    (this.#puff.material as THREE.PointsMaterial).opacity = 0.5 * fade;
    this.#puff.geometry.getAttribute('position').needsUpdate = true;
  }

  /**
   * Emit behind the striker, then age every speck.
   *
   * Emission is a budget carried across frames rather than a per-frame count,
   * so the rate is the same whether the game is running at 120 fps or
   * struggling at 30 — otherwise a slow device draws a sparser trail, which is
   * exactly backwards from what it needs.
   */
  #updateTrail(
    delta: number,
    level: number,
    striker: { readonly x: number; readonly z: number; readonly speed: number } | null,
  ): void {
    const p = this.#trailPositions;
    const life = this.#trailLife;

    if (striker && level > 0.02 && striker.speed > TRAIL_MIN_SPEED) {
      // Faster and freshly powdered means more dust; both taper to nothing.
      const intensity = Math.min(1, (striker.speed - TRAIL_MIN_SPEED) / 12) * level;
      this.#trailBudget += TRAIL_RATE * intensity * delta;

      while (this.#trailBudget >= 1) {
        this.#trailBudget -= 1;
        const o = this.#trailNext * 3;
        // A little scatter, so the trail is a plume rather than a wire.
        p[o] = striker.x + (Math.random() - 0.5) * 0.16;
        p[o + 1] = 0.02 + Math.random() * 0.05;
        p[o + 2] = striker.z + (Math.random() - 0.5) * 0.16;
        life[this.#trailNext] = TRAIL_SECONDS;
        this.#trailNext = (this.#trailNext + 1) % TRAIL_PARTICLES;
      }
    } else {
      // Never let an unspent budget dump a burst of dust on the next shot.
      this.#trailBudget = 0;
    }

    let alive = 0;
    for (let i = 0; i < TRAIL_PARTICLES; i += 1) {
      const remaining = life[i] ?? 0;
      if (remaining <= 0) continue;

      const next = remaining - delta;
      life[i] = Math.max(0, next);
      if (next <= 0) {
        // Park it, rather than leave a stale speck at full brightness.
        p[i * 3 + 1] = -999;
        continue;
      }

      alive += 1;
      // Settling, not billowing: powder falls back to the board.
      p[i * 3 + 1] = Math.max(0.012, (p[i * 3 + 1] ?? 0) - delta * 0.06);
    }

    this.#trail.visible = alive > 0;
    if (alive > 0 || this.#trail.geometry.getAttribute('position').needsUpdate) {
      this.#trail.geometry.getAttribute('position').needsUpdate = true;
    }
  }

  /**
   * Emit and age the burn.
   *
   * Each speck cools on a fixed curve rather than by lerping between two
   * colours: amber to ember is a hue shift, ember to smoke is a
   * desaturation, and doing both as one interpolation gives a muddy brown
   * halfway. Two segments keep the fire looking like fire.
   */
  #updateBurn(
    delta: number,
    level: number,
    striker: { readonly x: number; readonly z: number; readonly speed: number } | null,
  ): void {
    const p = this.#burnPositions;
    const c = this.#burnColors;
    const life = this.#burnLife;

    if (striker && level > 0.05 && striker.speed > BURN_MIN_SPEED) {
      const intensity = Math.min(1, (striker.speed - BURN_MIN_SPEED) / 10) * level;
      this.#burnBudget += BURN_RATE * intensity * delta;

      while (this.#burnBudget >= 1) {
        this.#burnBudget -= 1;
        const i = this.#burnNext;
        const o = i * 3;
        p[o] = striker.x + (Math.random() - 0.5) * 0.2;
        p[o + 1] = 0.03 + Math.random() * 0.07;
        p[o + 2] = striker.z + (Math.random() - 0.5) * 0.2;
        // Born white-hot.
        c[o] = 1;
        c[o + 1] = 0.86;
        c[o + 2] = 0.5;
        life[i] = BURN_SECONDS;
        this.#burnNext = (this.#burnNext + 1) % BURN_PARTICLES;
      }
    } else {
      this.#burnBudget = 0;
    }

    let alive = 0;
    for (let i = 0; i < BURN_PARTICLES; i += 1) {
      const remaining = life[i] ?? 0;
      if (remaining <= 0) continue;

      const next = remaining - delta;
      life[i] = Math.max(0, next);
      if (next <= 0) {
        p[i * 3 + 1] = -999;
        continue;
      }

      alive += 1;
      const o = i * 3;
      // 0 at birth, 1 at death.
      const age = 1 - next / BURN_SECONDS;

      if (age < 0.4) {
        // Amber cooling to ember: the hue drops, the value barely does.
        const t = age / 0.4;
        c[o] = 1;
        c[o + 1] = 0.86 - 0.56 * t;
        c[o + 2] = 0.5 - 0.42 * t;
      } else {
        // Ember dying to smoke: everything converges on a dark grey.
        const t = (age - 0.4) / 0.6;
        c[o] = 1 - 0.78 * t;
        c[o + 1] = 0.3 - 0.09 * t;
        c[o + 2] = 0.08 + 0.13 * t;
      }

      // Smoke lifts as it cools; dust settles. The difference is most of what
      // separates the two trails at a glance.
      p[o + 1] = (p[o + 1] ?? 0) + delta * 0.14;
    }

    this.#burn.visible = alive > 0;
    this.#burn.geometry.getAttribute('position').needsUpdate = true;
    this.#burn.geometry.getAttribute('color').needsUpdate = true;
  }

  dispose(): void {
    for (const resource of this.#disposables) resource.dispose();
    this.#disposables.length = 0;
  }
}
