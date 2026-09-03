# How it works

The short version: blur is defined **once**, as the standard deviation (sigma) of
a Gaussian, in density-independent points. Each platform converts that sigma into
whatever unit its blur primitive wants, at the very last step. That conversion is
the only place the platforms differ, which is what makes them match.

Everything below is the detail behind that sentence.

---

## Why blurs don't match by default

Three separate problems. Most libraries solve none of them.

### 1. Every layer speaks a different unit

| | takes | meaning |
|---|---|---|
| Figma | a blur value `N` | Gaussian with sigma = `N / 2` |
| CSS `filter: blur()` | a length | that length **is** the sigma |
| Android `RenderEffect` | `radiusX`, `radiusY` | sigma = `0.57735 · radius + 0.5` |
| Core Animation `gaussianBlur` | `inputRadius` | the sigma, in points |

Pass the same number to each and you get four different blurs. This library
converts at the boundary instead — [`src/core/blurMath.ts`](../src/core/blurMath.ts)
is the only file where the number is decided, and it has two mirrors,
[`ios/FigmaBlurMath.h`](../ios/FigmaBlurMath.h) and
[`BlurMath.kt`](../android/src/main/java/com/figmablur/BlurMath.kt), that
`npm run parity` keeps in sync.

The Android row is worth dwelling on, because the parameter is named `radiusX`
and is not a radius. It runs through Skia's `ConvertRadiusToSigma` on the way in.
A build that passed sigma through unconverted measured **13.30 dip** where the
model called for 20.0 — and 20.0 fed through that formula predicts 13.06, a 2%
match. That is what pinned the conversion down.

### 2. iOS system materials saturate

`UIBlurEffect` boosts backdrop saturation by roughly **1.8×**. Figma does not.

This is the single biggest reason a stock iOS blur looks wrong beside the mock it
came from, and no amount of radius tuning fixes it — the radius is not the thing
that is wrong. `saturation` defaults to `1.0` here and is applied explicitly, so
it is authoritative rather than inherited.

Toggle it in the example's parity screen to see the difference directly.

### 3. Downscaling softens

Blurring a downscaled copy of the backdrop is the standard performance trick, and
the naive version overshoots.

The intuition is that to get sigma σ after scaling back up by `d`, you blur by
`σ / d`. But the downscale is itself a box filter of width `d`, and it contributes
its own blur. Blurs compose in **variance**, not in sigma, so the box's variance
has to come out of the budget first:

```
sigmaDownscaled = sqrt(σ² − (d² − 1) / 12) / d
```

Skip that and the result lands visibly softer than the reference. It is the
reason most downscaling blur implementations are a little too mushy.

---

## What each platform actually does

### iOS

A `CABackdropLayer` with a `CAFilter` chain — Gaussian blur, then saturation.

The backdrop layer samples the composited frame on the GPU, every frame, for
free. Nothing is snapshotted and no display link is running, which is why the
blur costs nothing extra while scrolling.

The sigma goes to the filter at **full resolution**. An earlier version set the
layer's `scale` to 1/d and divided the radius to match, mirroring Android — and
measured 4.11 dip where the model said 20.0, almost exactly the factor of 5 the
downsample chooser picks for that sigma. `scale` does not resample the way that
assumed, so the divided radius was simply a smaller blur.

**Layer blur** takes a different path. `CALayer.filters` is documented as
unsupported on iOS; it happens to work on `CABackdropLayer`, which is why
backdrop mode can use it, but on an ordinary content layer it renders undefined
garbage. So children are rasterised and blurred through Core Image, recomputed
only when React re-renders the subtree and coalesced onto the next runloop turn.

### Android

A `RenderNode` with a `RenderEffect` hung off it.

Once per frame: record what is behind the view into the node, downscaled and
padded outward by 3σ; hang the blur off the node, optionally chained with the
glass shader; draw the node back, scaled up and clipped to the rounded rect.

No bitmaps, no readbacks, no per-frame allocation. The only CPU cost is a
display-list re-record, which scales with the **number of views** behind the blur
rather than with its pixel area.

The capture cannot simply record the root. RenderNodes reference each other
rather than copying, so recording an ancestor that contains the blur view makes
`blurNode → ScrollView → blurView → blurNode` — a cycle HWUI walks until the
stack overflows. Hiding the view during capture does not help, because the
ancestor's display list was recorded while it was still visible. Instead the
capture walks the chain from the root down to the host and draws only the
siblings painted **before** the host's branch, never entering that branch. That
is both cycle-free and the correct definition of a backdrop.

### Why the 3σ padding

A Gaussian is effectively zero beyond three standard deviations. Capturing that
much extra means every pixel inside the view is blurred from real content rather
than from a clamped edge. Without it the blur visibly changes character in a band
around its own border — the usual tell of a home-grown backdrop blur.

---

## Liquid Glass

On iOS 26+, `GlassView` is the platform's own `UIGlassEffect`. Everywhere else it
is synthesised in AGSL and chained into the same `RenderEffect` as the blur, so
the whole material is one GPU pass.

Two things separate glass from a frosted panel, and both are in
[`GlassShader.kt`](../android/src/main/java/com/figmablur/GlassShader.kt):

- **The rim magnifies.** Samples near the edge are displaced along the normal of
  a rounded-rect signed distance field. Physically this is light entering thick
  glass at a glancing angle; visually it is what makes the panel read as a solid
  object rather than a translucent hole.
- **The rim catches light.** A narrow specular term, biased toward a fixed
  top-left key light so panels lit the same way look like they share a scene.

### The material, and why it is a gamma lift

The obvious model for the material is a translucent white scrim. It does not fit.

Measured over a `#34C759` band, iOS lifts luminance 160 → 224 while dropping
saturation 0.74 → 0.36. Reproducing that lightening with a scrim desaturates well
past what Apple's material does, and pushing the scrim far enough drives the
darkest channel below zero — clamping there left `clear` at saturation 0.73
against iOS's 0.91.

A **power curve** fits both variants without clamping, because it raises dark
values hard and bright ones barely. That is also the mechanical reason glass
looks lit rather than milky: a scrim washes every channel toward white together,
while a gamma lift keeps the gap between them. A vibrancy pass afterwards
restores the spread the lift flattens.

Dark mode is a separate fit, because the material **inverts** rather than
dimming: `regular` halves luminance while *raising* saturation, so the same curve
runs with an exponent above 1. `clear` shares one set of constants across both
appearances, because iOS does too — measured in dark mode it returns the same
`rgb(21,225,216)` it produces in light.

Android follows the night-mode configuration, which is the signal iOS's glass
follows as well: the system appearance, not how bright the backdrop happens to be.

---

## Where the numbers came from

Every constant above is measured, and [docs/parity.md](parity.md) documents the
procedure — including the two ways it has already gone wrong. If a future OS
moves the material, the procedure is the thing to reuse; the constants are just
its output.
