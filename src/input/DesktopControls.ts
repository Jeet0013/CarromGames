/**
 * Mouse-specific tuning.
 *
 * Pointer plumbing is shared — `InputManager` handles mouse, touch, and pen
 * through one PointerEvent pipeline, because the gesture is identical and two
 * parallel implementations would drift apart. What genuinely differs between
 * devices is *tolerance*, and that is what these profiles carry.
 *
 * A mouse is precise and has a visible cursor, so the striker's grab radius can
 * be tight and the mis-tap guard small.
 */

import { PIECE_GEOMETRY } from '../physics/PhysicsConfig';
import type { ControlProfile } from './ControlProfile';

export const DesktopControls: ControlProfile = {
  name: 'desktop',
  /** Slightly beyond the striker's edge — forgiving, still unambiguous. */
  grabRadius: PIECE_GEOMETRY.striker.radius * 1.6,
  /** A mouse does not jitter, so a small drag is a real intent. */
  minDragToAim: 0.12,
  supportsHover: true,
};
