/**
 * Scene graph ownership.
 *
 * Everything visible is added and removed through here, so teardown between
 * matches has one well-defined path and nothing leaks GPU memory across a
 * level change.
 */

import * as THREE from 'three';

/**
 * Backdrop colour.
 *
 * Only ever seen for the frame or two before `Room`'s backdrop dome is
 * mounted, and behind it thereafter. Matched to the dome's horizon value so
 * the handover is invisible.
 */
const BACKGROUND_COLOR = 0x0d0b09;

export class SceneManager {
  readonly #scene: THREE.Scene;
  /** Tracks what this manager added, so `clearContent` cannot remove lights. */
  readonly #content = new Set<THREE.Object3D>();

  constructor() {
    this.#scene = new THREE.Scene();
    this.#scene.background = new THREE.Color(BACKGROUND_COLOR);
  }

  get scene(): THREE.Scene {
    return this.#scene;
  }

  /**
   * Light every physical material from the baked room.
   *
   * `environmentIntensity` rather than a brighter bake: the same texture also
   * feeds the backdrop's mood, and one exposed dial is easier to tune against
   * the key light than a constant buried in the bake.
   */
  setEnvironment(texture: THREE.Texture | null, intensity = 1): void {
    this.#scene.environment = texture;
    this.#scene.environmentIntensity = intensity;
  }

  /**
   * Add persistent scene furniture — lights, environment. Not tracked as
   * content, so it survives `clearContent()`.
   */
  addPermanent(...objects: THREE.Object3D[]): void {
    this.#scene.add(...objects);
  }

  /** Add gameplay content: the board, pieces, effects. */
  add(...objects: THREE.Object3D[]): void {
    for (const object of objects) {
      this.#scene.add(object);
      this.#content.add(object);
    }
  }

  /** Remove a tracked object and release its GPU resources. */
  remove(object: THREE.Object3D): void {
    this.#scene.remove(object);
    this.#content.delete(object);
    disposeObject(object);
  }

  /** Remove all gameplay content, leaving lights and environment intact. */
  clearContent(): void {
    for (const object of [...this.#content]) this.remove(object);
  }

  /** Full teardown, including permanent objects. */
  dispose(): void {
    this.clearContent();
    for (const child of [...this.#scene.children]) {
      this.#scene.remove(child);
      disposeObject(child);
    }
  }
}

/**
 * Recursively free geometries and materials.
 *
 * Three.js does not do this on removal — dropping a mesh without disposing
 * leaks its buffers on the GPU until context loss, which over a career run of
 * repeated level loads is a real leak rather than a theoretical one.
 *
 * Geometries and materials shared via `PieceFactory` are deliberately *not*
 * disposed here; the factory owns their lifetime.
 */
function disposeObject(root: THREE.Object3D): void {
  root.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;

    const mesh = node as THREE.Mesh;
    if (mesh.userData['sharedResources'] === true) return;

    mesh.geometry?.dispose();
    const material: THREE.Material | THREE.Material[] = mesh.material;
    if (Array.isArray(material)) for (const m of material) m.dispose();
    else material?.dispose();
  });
}
