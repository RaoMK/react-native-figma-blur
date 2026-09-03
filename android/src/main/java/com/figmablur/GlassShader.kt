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
}
