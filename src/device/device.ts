import { useSyncExternalStore } from 'react';

/**
 * desktop – mouse or trackpad is the main input (laptops, including touch-screen ones).
 * tablet  – touch-first, larger screen.
 * mobile  – touch-first phone.
 *
 * Tablets and phones share the touch UI with a landscape table.
 */
export type DeviceType = 'desktop' | 'tablet' | 'mobile';

/** Shortest screen side (CSS px) below which a touch device counts as a phone. */
const PHONE_MAX_SHORT_SIDE = 600;

/**
 * Work out what kind of device we're on. Called once, before any game starts.
 *
 * Uses what the browser says about the primary input rather than the
 * user-agent string: a device whose main pointer is coarse and can't
 * hover is touch-first. iPadOS pretends to be a Mac, so it's caught
 * by its touch points instead.
 *
 * Add ?device=mobile | tablet | desktop to the URL to force a layout
 * while testing.
 */
export function detectDevice(): DeviceType {
  const forced = new URLSearchParams(window.location.search).get('device');
  if (forced === 'mobile' || forced === 'tablet' || forced === 'desktop') return forced;

  const touchFirst =
    window.matchMedia('(pointer: coarse) and (hover: none)').matches ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  if (!touchFirst) return 'desktop';

  const shortSide = Math.min(window.screen.width, window.screen.height);
  return shortSide < PHONE_MAX_SHORT_SIDE ? 'mobile' : 'tablet';
}

export const isTouchDevice = (device: DeviceType) => device !== 'desktop';

// ── Orientation ────────────────────────────────────────────

const portraitQuery = () => window.matchMedia('(orientation: portrait)');

function subscribeToOrientation(onChange: () => void): () => void {
  const query = portraitQuery();
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

/** True while the screen is taller than it is wide. Re-renders when it flips. */
export function useIsPortrait(): boolean {
  return useSyncExternalStore(subscribeToOrientation, () => portraitQuery().matches);
}

// ── Fullscreen + landscape lock ────────────────────────────

/** Not in TypeScript's DOM types any more, but still supported by Chrome on Android. */
type LockableOrientation = ScreenOrientation & {
  lock?: (orientation: 'landscape') => Promise<void>;
};

/**
 * Go fullscreen and lock to landscape where the browser allows it (Android
 * Chrome does; iOS Safari doesn't, and the rotate prompt covers that case).
 * Must be called from a tap handler. Failures are expected and ignored.
 */
export async function enterLandscapeFullscreen(): Promise<void> {
  try {
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
      await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    }
    await (screen.orientation as LockableOrientation).lock?.('landscape');
  } catch {
    // Not supported here; the layout still works without it.
  }
}
