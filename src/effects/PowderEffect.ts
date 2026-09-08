/**
 * Powder on the board.
 *
 * A pale sheen laid over the playing surface that fades as the powder wears
 * off, plus a puff of dust when it is scattered. The visual is driven by the
 * physics world's own powder level, so what the player sees and what the coins
 * feel can never disagree.
 */

import * as THREE from 'three';

import { BOARD_CONFIG } from '../board/BoardConfig';

const PUFF_PARTICLES = 40;
const PUFF_SECONDS = 1.4;

export class PowderEffect {
  readonly #group = new THREE.Group();
  readonly #sheen: THREE.Mesh;
  readonly #puff: THREE.Points;
  readonly #positions: Float32Array;
  readonly #velocities: Float32Array;
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

  /** @param level 0–1 powder remaining, taken from the physics world. */
  update(delta: number, level: number): void {
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

  dispose(): void {
    for (const resource of this.#disposables) resource.dispose();
    this.#disposables.length = 0;
  }
}
