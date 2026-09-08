/**
 * Per-device input tolerances.
 *
 * The gesture is the same everywhere; only how forgiving it needs to be
 * changes. Keeping that as data means `InputManager` has one code path rather
 * than a device branch running through it.
 */

export interface ControlProfile {
  readonly name: 'desktop' | 'mobile';
  /** How close to the striker a press counts as grabbing it, in world units. */
  readonly grabRadius: number;
  /** Drag below this is treated as a mis-tap, not an aim. */
  readonly minDragToAim: number;
  readonly supportsHover: boolean;
}

/**
 * Pick a profile from the device's primary input.
 *
 * `pointer: coarse` is the right query rather than sniffing the user agent or
 * checking for touch support: a laptop with a touchscreen still has a mouse as
 * its primary pointer and should get the precise profile.
 */
export function detectProfile(desktop: ControlProfile, mobile: ControlProfile): ControlProfile {
  const coarse =
    typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
  return coarse ? mobile : desktop;
}
