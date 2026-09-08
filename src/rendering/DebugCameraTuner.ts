/**
 * Development-only camera tuner.
 *
 * Lets the camera angle and framing margin be dialled in live rather than by
 * editing `CAMERA_SETTINGS`, rebuilding, and re-judging from memory. It prints
 * the values to paste back into the config once they look right.
 *
 * The whole class is constructed behind `IS_DEV`, so Vite's static replacement
 * drops it from production bundles — the scope requires debug tooling to be
 * absent from shipped builds, not merely switched off.
 *
 * Keys (hold Shift for a coarse step):
 *   `  toggle the tuner
 *   ↑ ↓  elevation      ← →  azimuth
 *   [ ]  framing margin   0  reset
 *   P    print current values
 */

import type { CameraManager } from './CameraManager';

const FINE_STEP = 1;
const COARSE_STEP = 5;
const MARGIN_STEP = 0.02;

export class DebugCameraTuner {
  readonly #camera: CameraManager;
  #enabled = false;
  #hint: HTMLElement | undefined;

  constructor(camera: CameraManager) {
    this.#camera = camera;
    window.addEventListener('keydown', this.#onKeyDown);
  }

  readonly #onKeyDown = (event: KeyboardEvent): void => {
    // Backquote toggles; every other key is ignored while disabled, so the
    // tuner cannot interfere with gameplay input once controls exist.
    if (event.key === '`') {
      event.preventDefault();
      this.#toggle();
      return;
    }
    if (!this.#enabled) return;

    const step = event.shiftKey ? COARSE_STEP : FINE_STEP;
    let elevation = this.#camera.elevationDegrees;
    let azimuth = this.#camera.azimuthDegrees;
    let handled = true;

    switch (event.key) {
      case 'ArrowUp':
        elevation += step;
        break;
      case 'ArrowDown':
        elevation -= step;
        break;
      case 'ArrowLeft':
        azimuth -= step;
        break;
      case 'ArrowRight':
        azimuth += step;
        break;
      case '[':
        this.#camera.setMargin(this.#camera.margin - MARGIN_STEP);
        break;
      case ']':
        this.#camera.setMargin(this.#camera.margin + MARGIN_STEP);
        break;
      case '0':
        // Clears the override entirely, handing elevation back to the
        // aspect-driven rule rather than pinning it to the landscape default.
        this.#camera.resetAngles();
        this.#updateHint();
        event.preventDefault();
        return;
      case 'p':
      case 'P':
        this.#print();
        break;
      default:
        handled = false;
    }

    if (!handled) return;
    event.preventDefault();
    this.#camera.setAngles(elevation, azimuth);
    this.#updateHint();
  };

  #toggle(): void {
    this.#enabled = !this.#enabled;
    if (this.#enabled) this.#showHint();
    else this.#hideHint();
  }

  #showHint(): void {
    if (!this.#hint) {
      const hint = document.createElement('div');
      hint.style.cssText = [
        'position:fixed',
        'left:12px',
        'bottom:12px',
        'padding:10px 12px',
        'font:12px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace',
        'color:#f4ece1',
        'background:rgba(18,16,14,0.86)',
        'border:1px solid rgba(176,122,69,0.4)',
        'border-radius:8px',
        'pointer-events:none',
        'z-index:9999',
        'white-space:pre',
      ].join(';');
      document.body.append(hint);
      this.#hint = hint;
    }
    this.#hint.style.display = 'block';
    this.#updateHint();
  }

  #hideHint(): void {
    if (this.#hint) this.#hint.style.display = 'none';
  }

  #updateHint(): void {
    if (!this.#hint) return;
    this.#hint.textContent = [
      'CAMERA TUNER  (` to close)',
      `elevation  ${this.#camera.elevationDegrees.toFixed(1)}°   ↑ ↓`,
      `azimuth    ${this.#camera.azimuthDegrees.toFixed(1)}°   ← →`,
      `margin     ${this.#camera.margin.toFixed(2)}    [ ]`,
      'P print   0 reset   Shift = coarse',
    ].join('\n');
  }

  #print(): void {
    console.info(
      '[CameraTuner] paste into CAMERA_SETTINGS:\n' +
        `  elevationDegrees: ${this.#camera.elevationDegrees.toFixed(1)},\n` +
        `  azimuthDegrees: ${this.#camera.azimuthDegrees.toFixed(1)},\n` +
        `  framingMargin: ${this.#camera.margin.toFixed(2)},`,
    );
  }

  dispose(): void {
    window.removeEventListener('keydown', this.#onKeyDown);
    this.#hint?.remove();
    this.#hint = undefined;
  }
}
