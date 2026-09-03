# Verifying parity

The claim is that iOS and Android render the same blur. That is testable, and
this is how.

## The automated check

```bash
npm run parity
```

Asserts the blur model's constants are identical in all three places they exist —
[TypeScript](../src/core/blurMath.ts), the [iOS C header](../ios/FigmaBlurMath.h),
and the [Kotlin object](../android/src/main/java/com/figmablur/BlurMath.kt).

Comments throughout the codebase promise those stay in sync. This is what
enforces it, so a drift fails CI instead of quietly splitting the platforms. It
needs no device and runs in under a second.

```
Blur model constants agree across TypeScript, iOS and Android.
  Figma blur -> sigma        0.5
  Skia radius -> sigma       0.57735 * r + 0.5
  Downscale target sigma     4px (max 8x)
```

## Measuring a rendered blur

Given a reference and a screenshot of the same scene:

```bash
node parity/measure.mjs --reference figma-40.png --actual device-40.png --blur 40
```

It recovers the actual Gaussian sigma from a blurred step edge, reports the
error, and exits non-zero above 2% — roughly where a sigma difference becomes
visible side by side. Passing `--blur` also prints the `FIGMA_BLUR_TO_SIGMA`
implied by your reference, which is how you re-calibrate if a future OS moves.

### How the measurement works

A step edge convolved with a Gaussian is that Gaussian's **cumulative
distribution**. So the derivative of the edge profile *is* the Gaussian, and its
standard deviation is the answer — no curve fitting, no solver, no initial guess,
and it degrades gracefully on a noisy screenshot.

The decoder is dependency-free ([`parity/png.mjs`](../parity/png.mjs)) so this
runs on a clean checkout in CI.

## Measured results

`blurRadius={40}` — the model says sigma 20.0, density-independent:

| | measured | vs model |
|---|---|---|
| iOS — iPhone 17 Pro, @3× | 19.59 dip | −2.1% |
| Android — Pixel 6, @2.625× | 20.16 dip | +0.8% |
| **iOS vs Android** | | **2.9%** |

Glass, sampled through the material over a `#34C759` band:

| light | iOS | Android |
|---|---|---|
| `regular` | rgb(159,248,179) · sat 0.36 · lum 224 | rgb(160,244,168) · sat 0.34 · lum 220 |
| `clear` | rgb(21,225,216) · sat 0.91 · lum 181 | rgb(16,218,210) · sat 0.93 · lum 175 |

| dark | iOS | Android |
|---|---|---|
| `regular` | rgb(5,91,25) · sat 0.95 · lum 68 | rgb(6,91,7) · sat 0.93 · lum 67 |
| `clear` | rgb(21,225,216) · sat 0.91 · lum 181 | rgb(16,218,210) · sat 0.93 · lum 175 |

## Two ways this has already gone wrong

Both are worth knowing before you trust a number you measured yourself.

### Sampling a row that was outside the card

An early Android measurement read **+47.9%** and prompted a "fix" that changed
the Skia conversion. The measurement was junk: the screenshot had a different
scroll position, so the row being sampled was not inside the blurred card at all.
The corrected measurement showed the original formula had been right, and the
change was reverted.

**Guard:** check that the row you sample has a *soft* gradient. A hard step
(sigma near zero) means you are outside the card. The scan in `parity/` prints
the recovered sigma per row for exactly this reason.

### A window that clipped one side of the Gaussian

A later measurement read iOS at 17.8 dip against a model of 20.0. The window ran
from the card's text to its right edge — about 2σ available on the left and 8σ on
the right. Truncating one skirt biases sigma downward. Re-measuring with a
**symmetric** window sized in density-independent units gave 19.59.

**Guard:** centre the window on the edge, make it symmetric, size it in dip so
both platforms get the same span, and keep at least 4σ on each side.

## Reproducing the plates

The example app carries the fixture. Set `INITIAL` in `example/App.tsx` to
`'parity'` and `SHOW_PICKER` to `false`, then run on each platform.

The fixture is deliberately harsh — saturated bands with hard white step edges —
because a soft photographic backdrop hides a wrong sigma and sharp edges do not.
It is unpleasant to look at on purpose. The `gallery` and `scale` screens are the
ones meant for looking at.

## What is not yet automated

The rendered-sigma numbers above came from hand-picked coordinates on the fixture
screen, which is exactly how the first mistake above happened. A dedicated
fixture — one full-bleed card over a pure step edge, no text, known crop — would
make this a single command. It is on the [roadmap](../ROADMAP.md) and is a good
place to contribute.
