package com.figmablur

/**
 * Liquid Glass, synthesised.
 *
 * iOS 26 ships a glass material; Android has no equivalent, so we build one. It
 * runs as a RuntimeShader chained *after* the blur inside the same RenderEffect,
 * which means the whole material — blur, refraction, rim — is one GPU pass over an
 * already-downscaled texture. That is what keeps it affordable on a cheap phone.
 *
 * The two things that separate glass from a frosted panel are both here: the edge
 * magnifies what is behind it, and the rim catches light.
 */
object GlassShader {

  const val AGSL = """
uniform shader backdrop;
uniform float2 uSize;
uniform float  uRadius;
uniform float  uBand;
uniform float  uRefraction;
uniform float  uSpecular;
uniform float  uLift;
uniform float  uVibrancy;
// `layout(color)` is required for setColorUniform: it tells Skia this uniform
// is a colour and must be converted into the shader's working colour space.
// Without it setColorUniform throws rather than silently mis-rendering.
layout(color) uniform half4 uTint;

// Signed distance to a rounded rectangle: negative inside, zero on the edge.
// Everything below is driven by this one number, which is why the material stays
// consistent across any size or corner radius without per-shape tuning.
float sdRoundBox(float2 p, float2 b, float r) {
  float2 q = abs(p) - b + r;
  return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
}

half4 main(float2 coord) {
  float2 halfSize = uSize * 0.5;
  float2 p = coord - halfSize;
  float d = sdRoundBox(p, halfSize, uRadius);

  // Surface normal by central difference. Cheaper and more robust than an
  // analytic normal, and exact enough at one-pixel steps.
  float e = 1.0;
  float dx = sdRoundBox(p + float2(e, 0.0), halfSize, uRadius)
           - sdRoundBox(p - float2(e, 0.0), halfSize, uRadius);
  float dy = sdRoundBox(p + float2(0.0, e), halfSize, uRadius)
           - sdRoundBox(p - float2(0.0, e), halfSize, uRadius);
  float2 n = normalize(float2(dx, dy) + float2(1e-6));

  // 0 across the flat centre, rising to 1 at the rim.
  float t = clamp((d + uBand) / max(uBand, 1e-3), 0.0, 1.0);
  float bend = t * t;

  // Pull the sample inward along the normal. Physically this is light entering
  // thick glass at a glancing angle near the edge; visually it is the slight
  // magnification that makes the panel read as a solid object with depth rather
  // than as a translucent hole.
  half4 c = backdrop.eval(coord - n * (uRefraction * bend));

  // The material itself, before any user tint.
  //
  // A gamma lift, which is what actually matches iOS 26's UIGlassEffect. The
  // obvious model — a translucent white scrim, optionally with a saturation
  // boost — does not fit: reproducing Apple's lightening that way drives the
  // darkest channel below zero, and clamping it there lands the `clear` variant
  // at saturation 0.73 where iOS reads 0.91.
  //
  // A power curve fits both variants to within ~4% per channel and needs no
  // clamp, because it lifts dark values hard and bright ones barely. That is
  // also why glass looks lit rather than milky: a scrim washes every channel
  // toward white together, while this keeps the gap between them.
  c.rgb = pow(clamp(c.rgb, 0.0, 1.0), half3(half(uLift)));

  // The lift alone lands the luminance but flattens the hue apart, so a vibrancy
  // pass restores the spread around it. `regular` needs it (0.26 -> 0.36
  // saturation, matching iOS); `clear` is already within tolerance and leaves it
  // at 1.0 rather than overshooting its darkest channel to zero.
  half vl = dot(c.rgb, half3(0.2126, 0.7152, 0.0722));
  c.rgb = clamp(mix(half3(vl), c.rgb, half(uVibrancy)), 0.0, 1.0);

  c.rgb = mix(c.rgb, uTint.rgb, uTint.a);

  // Specular rim. Narrow (pow 8) so it reads as an edge catching light instead
  // of an inner glow, and biased toward a fixed top-left key light so panels lit
  // from the same direction look like they share a scene.
  float rim = pow(t, 8.0);
  float lambert = clamp(dot(n, normalize(float2(-0.6, -0.8))), 0.0, 1.0);
  c.rgb += half3(half(uSpecular * rim * (0.35 + 0.65 * lambert)));

  // One-pixel feather on the outer boundary. The view clips to the same rounded
  // rect, but clipping alone leaves a hard stair-stepped edge on large radii.
  float alpha = 1.0 - smoothstep(-1.0, 0.0, d);
  return c * half(alpha);
}
"""

  /** Refraction band width, in dp, before downscaling. */
  const val BAND_DP = 14.0

  /** How far the rim bends the backdrop, in dp. */
  const val REFRACTION_DP = 8.0

  const val SPECULAR_REGULAR = 0.18
  const val SPECULAR_CLEAR = 0.10

  /**
   * The glass material, calibrated against iOS 26's UIGlassEffect.
   *
   * Measured by rendering the same card over the same backdrop on both platforms
   * and sampling through the glass. Over a #34C759 band iOS takes
   * rgb(52,199,89) -> rgb(159,248,179); over #00C7BE it takes
   * rgb(0,199,190) -> rgb(21,225,216). These exponents reproduce both.
   *
   * Re-derive them the same way if a future iOS moves the material — the
   * sampling procedure is the point, not the constants.
   */
  const val LIFT_REGULAR = 0.2966
  const val VIBRANCY_REGULAR = 1.37

  /**
   * `regular` in dark mode, measured the same way.
   *
   * The material inverts rather than merely dimming: over the same #34C759 band
   * iOS takes rgb(52,199,89) -> rgb(5,91,25), halving luminance (160 -> 68)
   * while *raising* saturation (0.74 -> 0.95). So the exponent crosses 1 — the
   * same power curve, now darkening — and the vibrancy pass drops slightly below
   * 1 to pull the extremes back toward the midtone.
   */
  const val LIFT_REGULAR_DARK = 4.145
  const val VIBRANCY_REGULAR_DARK = 0.93

  /**
   * `clear` uses one set of constants for both appearances, because iOS does
   * too: measured in dark mode it returns rgb(21,225,216) over #00C7BE, the same
   * value it produces in light mode. The variant is appearance-independent, and
   * branching on the trait would introduce a difference that is not there.
   */
  const val LIFT_CLEAR = 0.635
  const val VIBRANCY_CLEAR = 1.0
}
