/**
 * Collider debug overlay.
 *
 * Draws Rapier's own view of the world — every collider outline and sensor —
 * as line segments over the scene. When the visual board and the simulation
 * disagree, this is what shows which one is wrong.
 *
 * Dev-only: constructed behind `IS_DEV`, so it is tree-shaken from production.
 */

import * as THREE from 'three';

import type { PhysicsWorld } from './PhysicsWorld';

export class PhysicsDebugRenderer {
  readonly #lines: THREE.LineSegments;
  readonly #geometry = new THREE.BufferGeometry();
  readonly #physics: PhysicsWorld;
  #visible = false;

  constructor(physics: PhysicsWorld) {
    this.#physics = physics;

    const material = new THREE.LineBasicMaterial({
      vertexColors: true,
      // Colliders sit inside the meshes they describe, so without this the
      // board would hide the very outlines being inspected.
      depthTest: false,
      transparent: true,
      opacity: 0.9,
    });

    this.#lines = new THREE.LineSegments(this.#geometry, material);
    this.#lines.frustumCulled = false;
    // Draw last, on top of everything.
    this.#lines.renderOrder = 999;
    this.#lines.visible = false;
  }

  get object(): THREE.Object3D {
    return this.#lines;
  }

  get visible(): boolean {
    return this.#visible;
  }

  setVisible(visible: boolean): void {
    this.#visible = visible;
    this.#lines.visible = visible;
  }

  toggle(): boolean {
    this.setVisible(!this.#visible);
    return this.#visible;
  }

  /**
   * Pull fresh geometry from Rapier.
   *
   * Skipped entirely while hidden — `debugRender()` rebuilds the whole buffer
   * every call, which is far too expensive to run when nothing is looking.
   */
  update(): void {
    if (!this.#visible) return;

    const { vertices, colors } = this.#physics.debugRender();
    this.#geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    this.#geometry.setAttribute('color', new THREE.BufferAttribute(colors, 4));
  }

  dispose(): void {
    this.#geometry.dispose();
    const material = this.#lines.material;
    if (Array.isArray(material)) for (const m of material) m.dispose();
    else material.dispose();
  }
}
