import type { FigmaBlurProps } from './types';

/**
 * Ready-made materials.
 *
 * These are not guesses at what iOS ships — they are the Figma recipes designers
 * actually draw (a background blur plus a translucent white/black fill), so the
 * rendered result matches the mock rather than matching UIKit.
 */
export const Materials = {
  ultraThin: { blurRadius: 20, tintColor: 'rgba(255,255,255,0.30)' },
  thin: { blurRadius: 40, tintColor: 'rgba(255,255,255,0.45)' },
  regular: { blurRadius: 60, tintColor: 'rgba(255,255,255,0.60)' },
  thick: { blurRadius: 80, tintColor: 'rgba(255,255,255,0.75)' },

  ultraThinDark: { blurRadius: 20, tintColor: 'rgba(20,20,22,0.30)' },
  thinDark: { blurRadius: 40, tintColor: 'rgba(20,20,22,0.45)' },
  regularDark: { blurRadius: 60, tintColor: 'rgba(20,20,22,0.60)' },
  thickDark: { blurRadius: 80, tintColor: 'rgba(20,20,22,0.75)' },
} as const satisfies Record<string, FigmaBlurProps>;

export type MaterialName = keyof typeof Materials;
