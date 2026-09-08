/**
 * Touch-specific tuning.
 *
 * A fingertip covers roughly a centimetre of screen and there is no cursor to
 * aim it with, so the striker needs a much larger grab radius than the mouse
 * profile allows — sized to the finger, not to the striker.
 *
 * The mis-tap threshold is also higher: a tap on a touchscreen almost always
 * carries a few pixels of travel, and without the larger guard those would
 * register as tiny accidental shots.
 */

import { PIECE_GEOMETRY } from '../physics/PhysicsConfig';
import type { ControlProfile } from './ControlProfile';

export const MobileControls: ControlProfile = {
  name: 'mobile',
  grabRadius: PIECE_GEOMETRY.striker.radius * 3.2,
  minDragToAim: 0.28,
  supportsHover: false,
};
