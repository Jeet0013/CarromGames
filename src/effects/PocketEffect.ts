/**
 * Pocket celebration: a burst of sparks and a flash of light in the hole.
 *
 * This is the game's single most important piece of feedback — it is the moment
 * a player finds out they scored. A coin simply vanishing reads as a glitch, so
 * the pocket itself lights up: confirmation arrives at the place the player is
 * already looking.
 *
 * Everything is pooled. A shot can pocket several coins at once, and allocating
 * geometry mid-shot is exactly when the frame budget is tightest.
 */

import * as THREE from 'three';

import { BOARD_CONFIG, POCKET_POSITIONS } from '../board/BoardConfig';

/** Sparks per burst. Enough to read as a burst, few enough to stay tasteful. */
const SPARKS = 14;
const SPARK_LIFETIME = 0.55;
const FLASH_LIFETIME = 0.4;

interface Burst {
  readonly pocketIndex: number;
  elapsed: number;
  readonly velocities: Float32Array;
}

export class PocketEffect {
  readonly #group = new THREE.Group();
  readonly #sparks: THREE.Points;
  readonly #positions: Float32Array;
  readonly #flashes: THREE.Mesh[] = [];
  readonly #bursts: Burst[] = [];
  readonly #disposables: Array<THREE.BufferGeometry | THREE.Material | THREE.Texture> = [];

  /** Which burst owns each spark slot, or −1 when free. */
  readonly #slotOwner: number[] = [];

  constructor() {
    this.#group.name = 'PocketEffects';

    const capacity = SPARKS * POCKET_POSITIONS.length;
    this.#positions = new Float32Array(capacity * 3);
    for (let i = 0; i < capacity; i += 1) this.#slotOwner.push(-1);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.#positions, 3));

    const material = new THREE.PointsMaterial({
      size: 0.09,
      map: this.#sparkTexture(),
      transparent: true,
      // Additive so overlapping sparks build brightness rather than muddying.
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      color: 0xffd489,
    });

    this.#sparks = new THREE.Points(geometry, material);
    this.#sparks.frustumCulled = false;
    this.#sparks.renderOrder = 950;
    this.#group.add(this.#sparks);
    this.#disposables.push(geometry, material);

    // One flash disc per pocket, reused.
    const flashGeometry = new THREE.CircleGeometry(BOARD_CONFIG.pocket.radius * 2.3, 24);
    flashGeometry.rotateX(-Math.PI / 2);
    this.#disposables.push(flashGeometry);

    for (const pocket of POCKET_POSITIONS) {
      const flashMaterial = new THREE.MeshBasicMaterial({
        color: 0xffc670,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const flash = new THREE.Mesh(flashGeometry, flashMaterial);
      flash.position.set(pocket.x, 0.012, pocket.z);
      flash.visible = false;
      flash.renderOrder = 940;
      this.#flashes.push(flash);
      this.#group.add(flash);
      this.#disposables.push(flashMaterial);
    }

    this.#hideAllSparks();
  }

  get group(): THREE.Group {
    return this.#group;
  }

  /** A soft radial dot, generated rather than loaded — no asset files. */
  #sparkTexture(): THREE.Texture {
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      gradient.addColorStop(0, 'rgba(255,255,255,1)');
      gradient.addColorStop(0.35, 'rgba(255,214,140,0.85)');
      gradient.addColorStop(1, 'rgba(255,180,80,0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, size, size);
    }
    const texture = new THREE.CanvasTexture(canvas);
    this.#disposables.push(texture);
    return texture;
  }

  #hideAllSparks(): void {
    // Parked far below the board rather than scaled to zero, which would still
    // cost a draw at the origin.
    for (let i = 0; i < this.#positions.length; i += 3) this.#positions[i + 1] = -999;
  }

  /** Fire a burst at a pocket. */
  play(pocketIndex: number): void {
    const pocket = POCKET_POSITIONS[pocketIndex];
    if (!pocket) return;

    const base = pocketIndex * SPARKS;
    const velocities = new Float32Array(SPARKS * 3);

    for (let i = 0; i < SPARKS; i += 1) {
      const slot = base + i;
      this.#slotOwner[slot] = pocketIndex;

      this.#positions[slot * 3] = pocket.x;
      this.#positions[slot * 3 + 1] = 0.02;
      this.#positions[slot * 3 + 2] = pocket.z;

      // Sprayed upward and outward — coins drop *in*, so the spark reads as
      // energy coming back out.
      const angle = (i / SPARKS) * Math.PI * 2 + Math.random() * 0.4;
      const speed = 0.9 + Math.random() * 1.5;
      velocities[i * 3] = Math.cos(angle) * speed;
      velocities[i * 3 + 1] = 1.6 + Math.random() * 1.8;
      velocities[i * 3 + 2] = Math.sin(angle) * speed;
    }

    this.#bursts.push({ pocketIndex, elapsed: 0, velocities });

    const flash = this.#flashes[pocketIndex];
    if (flash) {
      flash.visible = true;
      (flash.material as THREE.MeshBasicMaterial).opacity = 0.85;
    }

    this.#sparks.geometry.getAttribute('position').needsUpdate = true;
  }

  update(delta: number): void {
    if (this.#bursts.length === 0) return;

    for (let b = this.#bursts.length - 1; b >= 0; b -= 1) {
      const burst = this.#bursts[b];
      if (!burst) continue;

      burst.elapsed += delta;
      const t = burst.elapsed / SPARK_LIFETIME;
      const base = burst.pocketIndex * SPARKS;

      const v = burst.velocities;
      const p = this.#positions;
      for (let i = 0; i < SPARKS; i += 1) {
        const slot = (base + i) * 3;
        const vi = i * 3;
        p[slot] = (p[slot] ?? 0) + (v[vi] ?? 0) * delta;
        p[slot + 1] = (p[slot + 1] ?? 0) + (v[vi + 1] ?? 0) * delta;
        p[slot + 2] = (p[slot + 2] ?? 0) + (v[vi + 2] ?? 0) * delta;
        // Gravity on the sparks so they arc rather than fly straight out.
        v[vi + 1] = (v[vi + 1] ?? 0) - 6 * delta;
      }

      const flash = this.#flashes[burst.pocketIndex];
      if (flash) {
        const fade = Math.max(0, 1 - burst.elapsed / FLASH_LIFETIME);
        (flash.material as THREE.MeshBasicMaterial).opacity = 0.85 * fade * fade;
        flash.scale.setScalar(1 + (1 - fade) * 0.5);
        if (fade <= 0) flash.visible = false;
      }

      if (t >= 1) {
        for (let i = 0; i < SPARKS; i += 1) {
          this.#positions[(base + i) * 3 + 1] = -999;
          this.#slotOwner[base + i] = -1;
        }
        this.#bursts.splice(b, 1);
      }
    }

    this.#sparks.geometry.getAttribute('position').needsUpdate = true;
  }

  dispose(): void {
    for (const resource of this.#disposables) resource.dispose();
    this.#disposables.length = 0;
  }
}
