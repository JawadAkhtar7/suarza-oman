/**
 * Close a drawer by swiping it away.
 *
 * Right-to-left, because that is the direction the drawer itself leaves in — a
 * gesture that disagrees with the animation feels broken even when it works.
 *
 * Three guards stop it firing by accident, and each one is a real mis-trigger:
 * a minimum distance so a tap with a shaky thumb is not a swipe; a dominance
 * check so scrolling a long menu diagonally does not close it; and a time limit
 * so a slow drag while reading is a drag, not a flick.
 */

import { useRef, type TouchEvent } from 'react';

/** Far enough to be deliberate, short enough to work on a narrow phone. */
const MIN_DISTANCE = 55;
/** The horizontal part must beat the vertical part by this much. */
const DOMINANCE = 1.6;
const MAX_DURATION = 700;

export interface SwipeHandlers {
  onTouchStart: (event: TouchEvent) => void;
  onTouchEnd: (event: TouchEvent) => void;
}

export function useSwipeToClose(onClose: () => void, enabled = true): SwipeHandlers {
  const start = useRef<{ x: number; y: number; at: number } | null>(null);

  return {
    onTouchStart: (event) => {
      const touch = event.touches[0];
      /* A second finger means a pinch or a two-handed grab, never a dismissal. */
      if (!touch || event.touches.length > 1) {
        start.current = null;
        return;
      }
      start.current = { x: touch.clientX, y: touch.clientY, at: Date.now() };
    },

    onTouchEnd: (event) => {
      const from = start.current;
      start.current = null;
      if (!enabled || !from) return;

      const touch = event.changedTouches[0];
      if (!touch) return;

      const dx = touch.clientX - from.x;
      const dy = touch.clientY - from.y;

      if (Date.now() - from.at > MAX_DURATION) return;
      if (dx > -MIN_DISTANCE) return;
      if (Math.abs(dx) < Math.abs(dy) * DOMINANCE) return;

      onClose();
    },
  };
}
