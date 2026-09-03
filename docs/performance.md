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

## Lists

One blur per cell in a `FlatList` is the case most likely to go wrong.

### Measured, on a real device

An iQOO I2207 (Android 15, 1080×2400 @ 440dpi), ten blurred rows visible,
scrolled under `scripts/bench-android.sh`. All three modes back to back on a cool
device:

| mode | janky | 50th | 90th | GPU 50th |
|---|---|---|---|---|
| a blur on every row | 20.8% | 25 ms | 57 ms | 6 ms |
| one blur over the list | 0.62% | 12 ms | 17 ms | 5 ms |
| tint only, no blur | 0.87% | 10 ms | 11 ms | 6 ms |

Two things this settles:

**The GPU is not the bottleneck.** 5–6 ms in every mode, including the one with
no blur at all. `downsampleFactor` reduces GPU work and will not help here.

**One blur is free; ten are not.** A single blur over the whole list is
indistinguishable from no blur, even though it overlaps every row and genuinely
redraws them. The cost is per *blur view*, not per blurred pixel — roughly
1.5 ms of UI thread each, and swapping an expensive layer-blurred backdrop for a
flat colour barely moved the median, so it is fixed overhead rather than content.

### What the library does about it

**Siblings outside the capture region are skipped.** A capture only needs content
that can reach its own rect, so cells that do not overlap the one being blurred
are not redrawn. Without this the cell at index `j` redraws every cell before it,
which is `k² / 2` re-records per frame across `k` visible blurred cells.

The culling is exact rather than an approximation — content outside the capture
rect cannot influence a pixel inside it — and that was verified rather than
assumed: the bench and gallery screens were rendered before and after and diffed
across 2.1M pixels, maximum channel difference **0**.

**Off-screen cells do not capture.** A list keeps cells attached beyond the
viewport and each still received a pre-draw callback.

Both remove work that provably could not affect the output. Neither has been
measured as a speedup in isolation, because the device warms over a benchmarking
session and drifts far more than the effect being measured — see the note below.

### If you need more

| instead of | do |
|---|---|
| A blur on every cell | One blur on the **chrome over** the list. Measured at 0.62% jank above — effectively free. |
| A blur behind each card | `blurRadius={0}` with a `tintColor`. No capture at all. |
| Blurring during the scroll | `enabled={false}` on scroll begin, `true` on momentum end. |

### Benchmarking honestly

The example ships an A/B rig on its **bench** screen — the same list rendered
three ways so the difference is attributable to the blur and nothing else.

```sh
npm run bench:android              # the example app
npm run bench:android -- com.yourapp 12
```

Two warnings, both learned the hard way here:

- **Emulators are useless for this.** One reported 24 frames at a 1100 ms median
  with a 4950 ms GPU percentile, on a static screen.
- **Devices drift as they warm.** Identical code measured 25 ms cold and 48 ms
  after a session of benchmarking, with the SoC at 60 °C — a larger difference
  than most changes you would be trying to detect. Repeated runs at one
  temperature are stable to about ±1%, so the fix is to **interleave**: alternate
  the two builds, several times each, so drift lands as noise in both arms rather
  than as a result in one.

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
