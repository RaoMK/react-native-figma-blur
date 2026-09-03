# Performance and size

## Size

Measured, not estimated.

| | |
|---|---|
| npm package, packed | **46.6 kB** |
| npm package, unpacked | **167 kB** across 85 files |
| JS bundle contribution | **6.9 kB** raw · **1.8 kB** gzipped |
| Runtime dependencies | **none** |

The bundle figure is a real diff: two minimal Metro release bundles, one
importing nothing and one importing the whole public surface with a reference
that prevents it being dropped as unused.

```sh
npx react-native bundle --platform ios --dev false \
  --entry-file bundle-base.js --bundle-output base.jsbundle
npx react-native bundle --platform ios --dev false \
  --entry-file bundle-with.js --bundle-output with.jsbundle
```

Native code adds to the binary as well. That figure depends heavily on build
configuration — optimisation level, dead-stripping, whether Fabric's generated
C++ is shared with other components — so a single number would be misleading and
is not quoted here.

## What the blur costs per frame

Both platforms are GPU-only. There is no bitmap capture, no readback to the CPU,
and no CPU blur anywhere in either path.

### iOS

The backdrop is sampled by `CABackdropLayer`, which is the compositor reading the
frame it is already assembling. There is **no snapshot and no display link** — the
blur costs nothing extra while scrolling, because nothing has to be re-captured.

`blurMode="layer"` is the exception and is genuinely more expensive: it rasterises
the subtree through Core Image. That happens only when React re-renders the
subtree, not per frame, and is coalesced so a burst of prop, mount and layout
changes costs one pass. Prefer `backdrop` for anything continuously animating.

### Android

Once per frame, per blur view:

1. Re-record the views painted before it into a `RenderNode` — the only CPU work
2. The `RenderEffect` blurs on the GPU
3. Draw the node back, scaled up and clipped

The cost of step 1 scales with the **number of views** behind the blur, not with
the blur's pixel area or radius. A large blur over a simple background is cheap;
a small blur over a hundred views is not. That is the opposite of the intuition
most people bring, and it is the single most useful thing to know when optimising.

Steps 2 and 3 are near-constant regardless of `blurRadius`, because the blur runs
on a **downscaled** copy: the downsample factor is chosen to keep the
post-downscale sigma near 4px whatever you ask for. A `blurRadius` of 200 costs
about what a `blurRadius` of 20 costs.

### Allocations

The draw and capture paths allocate nothing per frame. Paints, the corner path,
the location buffers and the ancestor-chain list are all fields, reused across
frames. The noise tile is generated once and cached.

## Lists: the case that bites

The most common way to get into trouble is one blur per cell in a `FlatList`.
The two platforms behave completely differently here, so this is worth reading
before you build it.

### iOS is fine

Each blur is a `CABackdropLayer` and the compositor does the work. No capture, no
per-frame CPU. Cost is GPU fill rate, roughly linear in the number of visible
blurred cells. A list of blurred rows is viable.

### Android scales quadratically

Every attached blur view captures on **every frame**, and the capture draws the
siblings painted before it. Inside a list's content container, those siblings are
the other cells. So a cell at index `j` redraws `j` cells, and across `k` visible
blurred cells you get:

```
≈ k² / 2  sibling re-records per frame
```

At 8 visible blurred rows that is ~28 re-records per frame, on top of 8 RenderNode
recordings and 8 blur passes.

Two things soften it, and neither makes it the right shape: virtualization means
`k` is the number of **windowed** cells rather than your dataset length, and each
sibling redraw re-records only that cell's own root — its children come back by
RenderNode reference, which is cheap.

**`downsampleFactor` does not help here.** It reduces GPU blur cost, and the
bottleneck is CPU re-recording.

### What to do instead

| instead of | do |
|---|---|
| A blur on every cell | One blur on the **chrome over** the list — sticky header, tab bar, floating action bar. One capture regardless of list length, and it is what the material is for. |
| A blur behind each card | `blurRadius={0}` with a `tintColor`. No capture at all, and at card size over a busy background the difference is usually invisible. |
| Blurring during the scroll | `enabled={false}` on scroll begin, `true` on momentum end. Skipping the capture is far cheaper than unmounting the view. |

If you genuinely need per-cell blur on Android, keep the simultaneously-visible
count in single digits and measure on your lowest-end target.

### Measure it yourself

The example app ships an A/B rig — the **bench** screen renders the same list
three ways (`blur cells` / `tint only` / `chrome`) so the difference is
attributable to the blur and nothing else. Flip mode on screen, then:

```sh
npm run bench:android              # the example app
npm run bench:android -- com.yourapp 12
```

It scrolls, then reports frame counts, jank and percentiles. Compare **modes on
one device**; do not compare devices.

## Measuring it on your hardware

Frame numbers from an emulator are worthless — a software GPU is not the thing
you are shipping to — so none are published here. Measure on a real device:

**Android**

```sh
adb shell dumpsys gfxinfo <your.package> reset
# scroll the screen for a few seconds
adb shell dumpsys gfxinfo <your.package> | grep -E "Total frames|Janky|percentile"
```

Run it twice — once as-is, once with `enabled={false}` on the blur views — and
compare. The **delta** is the number that transfers between devices; the absolute
values do not.

**iOS**

Instruments → Animation Hitches, or the Core Animation FPS overlay in the
simulator. Watch offscreen-rendering warnings if you have combined the blur with
shadows on the same view.

## If it is slow

In rough order of effect:

1. **Fewer views behind the blur.** On Android this is the dominant cost. A
   simplified backdrop beats a smaller radius every time.
2. **Prefer `backdrop` to `layer` on iOS.** Backdrop is free per frame; layer
   rasterises.
3. **Raise `downsampleFactor`.** `0` chooses automatically; a larger number
   trades a little softness for speed.
4. **`enabled={false}` rather than unmounting.** Switching the blur off is far
   cheaper than tearing the view down and rebuilding it.
5. **Avoid stacking many large blurs.** Each is independent; ten overlapping
   blur views do ten captures.
