# react-native-figma-blur

Blur and Liquid Glass for React Native that render **identically on iOS and Android**, matched to what Figma draws — driven by one shared Gaussian model instead of two platforms' worth of guesswork.

New Architecture only. No legacy bridge path.

```tsx
import { FigmaBlurView, GlassView } from 'react-native-figma-blur';

// blurRadius is the number straight off the Figma inspector.
<FigmaBlurView blurRadius={40} tintColor="rgba(255,255,255,0.45)" style={{ borderRadius: 24 }}>
  <Text>Same pixels on both platforms</Text>
</FigmaBlurView>

<GlassView variant="regular" style={{ borderRadius: 28 }} />
```

## Why existing blurs don't match

Three separate problems, and most libraries solve none of them:

**Every layer speaks a different unit.** Figma's blur value is 2x the Gaussian sigma. CSS `blur()` *is* the sigma. Android's `RenderEffect` takes a Skia "radius" that it converts with `sigma = 0.57735·radius + 0.5`. Core Animation's `gaussianBlur` takes yet another. Passing the same number to each gives you three different blurs. This library defines blur once, as sigma in points, and converts at the very last step per platform — [`src/core/blurMath.ts`](src/core/blurMath.ts) is the only file where the number is decided.

**iOS materials saturate.** `UIBlurEffect` boosts backdrop saturation by roughly 1.8x. Figma does not. This is the single biggest reason a stock iOS blur looks wrong next to the mock it came from, and it survives any amount of radius tuning. We default `saturation` to `1.0` and force it.

**Downscaling softens.** Blurring a downscaled backdrop is the standard performance trick, and the naive `sigma / d` overshoots, because the downscale is itself a box filter that contributes its own blur. Blurs compose in variance, not sigma, so the box's variance has to come out of the budget first:

```
sigmaDownscaled = sqrt(sigma² − (d² − 1)/12) / d
```

Skip that and Android renders visibly softer than iOS at the same nominal radius.

## Performance

Both platforms are GPU-only, with no per-frame bitmap anywhere.

**iOS** samples the backdrop through a `CABackdropLayer`, which is live GPU capture — it costs nothing extra during scrolling because there is no snapshot to retake. The backdrop is sampled at reduced resolution (`scale`) with the sigma corrected to match.

**Android** records the ancestor tree into a `RenderNode` and hangs a `RenderEffect` off it. The only CPU cost is a display-list re-record, which scales with the *number of views* behind the blur, not with its pixel area. The blur itself runs on an already-downscaled texture — a 1/4-scale capture is ~16x less work — which is what keeps a large blur affordable on a cheap phone.

Both cap the post-downscale sigma near 4px, which also puts Android permanently out of reach of its 250px `RenderEffect` limit.

The capture is padded outward by 3σ so edge pixels blur from real content rather than from a clamped border. Without that, the blur visibly changes character in a band around its own edge — the usual tell of a home-grown backdrop blur.

## Liquid Glass

`GlassView` is the platform's own glass material on iOS 26+ (`UIGlassEffect`, including `glassInteractive`).

Android has no equivalent, so it is synthesised in AGSL — [`GlassShader.kt`](android/src/main/java/com/figmablur/GlassShader.kt) — and chained into the same `RenderEffect` as the blur, so the whole material is one GPU pass. The two things that separate glass from a frosted panel are both there: the rim magnifies what is behind it (sampling displaced along a rounded-rect SDF normal), and it catches light (a narrow specular term). Requires API 33+; below that you get blur and tint without refraction.

`glassInteractive` is accepted and ignored on Android rather than throwing, so shared JSX renders on both platforms.

## Measured parity

Both platforms rendering the same `blurRadius={40}` over a hard step edge, sigma
recovered from the screenshots and converted to density-independent units:

| | measured | vs model (20.0) |
|---|---|---|
| iOS — iPhone 17 Pro, @3x | 19.59 dip | −2.1% |
| Android — Pixel 6, @2.625x | 20.16 dip | +0.8% |
| **iOS vs Android** | | **2.9%** |

Engines live for those numbers: `ios.backdropLayer` (exact radius, native glass)
and `android.renderEffect+agsl` (exact radius, shader glass).

## Verifying parity

The claim is testable, and the harness is the point:

```bash
npm run parity
```

That asserts the model's constants are identical in all three places they exist — TypeScript, the iOS C header, and the Kotlin object — so a drift fails CI instead of quietly splitting the platforms.

Given two images it also measures them:

```bash
node parity/measure.mjs --reference figma-40.png --actual device-40.png --blur 40
```

It recovers the actual Gaussian sigma from a blurred step edge (the derivative of a blurred step *is* the Gaussian, so its standard deviation is the answer — no curve fitting), reports the error, and fails above 2%, which is roughly where a sigma difference becomes visible side by side. Passing `--blur` also prints the `FIGMA_BLUR_TO_SIGMA` implied by your reference, which is how you re-calibrate if a future OS moves.

## API

### `<FigmaBlurView />`

| Prop | Type | Default | |
|---|---|---|---|
| `blurRadius` | `number` | `0` | Figma units — paste from the inspector |
| `blurMode` | `'backdrop' \| 'layer'` | `'backdrop'` | Figma's Background blur vs Layer blur |
| `tintColor` | `ColorValue` | — | Overlay fill above the blur |
| `saturation` | `number` | `1.0` | `1.0` is Figma-neutral; iOS materials ship ~1.8 |
| `downsampleFactor` | `number` | `0` | `0` picks from the radius |
| `noiseOpacity` | `number` | `0` | Grain, to dither banding on large flat blurs |
| `glass` | `'none' \| 'regular' \| 'clear'` | `'none'` | |
| `glassTintColor` | `ColorValue` | — | |
| `glassInteractive` | `boolean` | `false` | iOS 26+ only |
| `fallbackColor` | `ColorValue` | — | Painted where no GPU blur exists |
| `enabled` | `boolean` | `true` | Cheaply switch the blur off without unmounting |

Corner radii come from `style` (`borderRadius` and the per-corner variants) and are applied to the blur's own mask. Note that `backgroundColor` sits *behind* the blur and will be invisible — use `tintColor`.

### `<GlassView />`

`FigmaBlurView` with `glass` preset and a matching default radius. Takes `variant` (`'regular' | 'clear'`).

### `Materials`

Ready-made recipes — `ultraThin`, `thin`, `regular`, `thick` and their `…Dark` counterparts. These are the Figma recipes designers actually draw (a background blur plus a translucent fill), so they match the mock rather than matching UIKit.

```tsx
<FigmaBlurView {...Materials.thin} />
```

### `getCapabilities()`

Reports which backend is live, whether the radius is exact, and whether glass is native or synthesised. Worth putting in your bug report template.

```ts
{ hasBackdropBlur, hasExactRadius, hasNativeGlass, hasShaderGlass, engine, apiLevel }
```

## Running the example

`example/` is a bare RN app that consumes the library from source. It is arranged
as a parity fixture: high-contrast bands with hard step edges, because a soft
photo hides a wrong sigma and sharp edges do not. Screenshot it on both platforms
and compare, or rebuild the same scene in Figma, export it, and feed both to
`parity/measure.mjs`.

```bash
npm install && npm run prepare     # build the library first
cd example && npm install
cd ios && pod install && cd ..
npm run ios      # or: npm run android
```

The saturation switch on screen toggles between `1.0` (Figma) and `1.8` (roughly
what iOS system materials do), which is the quickest way to see why a stock blur
never quite matches the mock however much you tune the radius.

## Platform support

| | Backdrop blur | Exact radius | Glass |
|---|---|---|---|
| iOS 26+ | ✅ | ✅ | ✅ native |
| iOS 15–25 | ✅ | ✅ | ⚠️ synthesised |
| Android 33+ | ✅ | ✅ | ⚠️ synthesised |
| Android 31–32 | ✅ | ✅ | ⚠️ blur + tint only |
| Android <31 | ❌ `fallbackColor` | — | ❌ |

### Why minSdk 31

Below API 31 Android has no GPU backdrop blur at all — only CPU bitmap blurring, which drops frames on exactly the low-end devices it would exist to serve. That is the jank this library was built to avoid, so below 31 it degrades to a flat `fallbackColor` rather than pretending. The library still *installs* at minSdk 24.

### App Store risk — read this before shipping

The exact-radius path on iOS uses two private classes, `CABackdropLayer` and `CAFilter`. They are used openly here — plain string literals, no obfuscation — because you should be able to see exactly what is touched and decide for yourself. They are the only way to set a real Gaussian radius on iOS; `UIVisualEffectView` alone cannot do it.

Every lookup is nil-checked and every path degrades. If the classes are unavailable, the engine falls back to `UIVisualEffectView` and then to a fitted intensity curve — a softer, approximate blur, never a crash. `getCapabilities().hasExactRadius` tells you at runtime which one you got.

If your risk tolerance rules private API out entirely, set `saturation` and `tintColor` to taste on the fallback path and accept that iOS will be an approximation of the Figma reference rather than a match.

## License

MIT
