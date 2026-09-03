## What this changes

<!-- One or two sentences. -->

## Why

<!-- If it fixes an issue, link it. If it fixes something subtle, say what the
     obvious approach was and why it did not work — that comment is often the
     most valuable part of the diff. -->

## Checklist

- [ ] `npm run verify` passes (typecheck, unit tests, constants in sync)
- [ ] Built the example on any platform whose native code I touched

### If this changes how a blur looks

- [ ] I measured it rather than eyeballing it — numbers below

<!-- From `npm run parity`, or the procedure in docs/parity.md. A blur has
     shipped here at 5x too weak and another at 48% too strong, and both looked
     entirely plausible by eye. -->

| | measured | expected |
|---|---|---|
| iOS | | |
| Android | | |

### If this changes a constant in the blur model

- [ ] Updated all three mirrors: `src/core/blurMath.ts`, `ios/FigmaBlurMath.h`,
      `android/.../BlurMath.kt`
- [ ] Recorded where the new value came from, in a comment
