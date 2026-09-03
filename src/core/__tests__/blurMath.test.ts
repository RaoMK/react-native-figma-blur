import {
  figmaBlurToSigma,
  skiaRadiusToSigma,
  skiaSigmaToRadius,
  chooseDownsample,
  downscaledSigma,
  figmaBlurToAndroidRadiusPx,
} from '../blurMath';

describe('figma -> sigma', () => {
  it('halves the Figma value, matching Figma\'s own CSS export', () => {
    expect(figmaBlurToSigma(40)).toBe(20);
    expect(figmaBlurToSigma(0)).toBe(0);
  });

  it('clamps negatives rather than producing an imaginary blur', () => {
    expect(figmaBlurToSigma(-10)).toBe(0);
  });
});

describe('skia radius <-> sigma', () => {
  it('round-trips', () => {
    for (const sigma of [1, 4, 12.5, 60]) {
      expect(skiaRadiusToSigma(skiaSigmaToRadius(sigma))).toBeCloseTo(sigma, 6);
    }
  });

  it('reports zero radius below the intercept, where Skia produces no blur', () => {
    expect(skiaSigmaToRadius(0.4)).toBe(0);
  });
});

describe('downscale correction', () => {
  /**
   * The property that matters: blurring at 1/d scale then upscaling must produce
   * the sigma that was originally asked for. Blurs compose in variance, so the
   * downscale's own box filter ((d^2-1)/12) has to come out of the budget. If
   * this test is ever loosened, Android will render softer than iOS.
   */
  it('composes back to the requested sigma', () => {
    for (const sigma of [8, 20, 45, 100]) {
      for (const d of [1, 2, 4, 8]) {
        const inner = downscaledSigma(sigma, d);
        const boxVariance = (d * d - 1) / 12;
        const composed = Math.sqrt((inner * d) ** 2 + boxVariance);
        expect(composed).toBeCloseTo(sigma, 5);
      }
    }
  });

  it('does not downscale a blur small enough to be cheap already', () => {
    expect(chooseDownsample(3)).toBe(1);
    expect(downscaledSigma(3, 1)).toBe(3);
  });

  it('scales up with sigma but stops at 8x', () => {
    expect(chooseDownsample(16)).toBe(4);
    expect(chooseDownsample(1000)).toBe(8);
  });
});

describe('android pipeline', () => {
  it('keeps the radius far below the 250px cap even for absurd blurs', () => {
    const { radiusPx } = figmaBlurToAndroidRadiusPx(400, 3);
    expect(radiusPx).toBeLessThan(250);
  });

  it('accounts for screen density', () => {
    const at1x = figmaBlurToAndroidRadiusPx(40, 1, 1).radiusPx;
    const at3x = figmaBlurToAndroidRadiusPx(40, 3, 1).radiusPx;
    expect(at3x).toBeGreaterThan(at1x * 2.5);
  });
});
