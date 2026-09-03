#!/usr/bin/env node
/**
 * Parity harness.
 *
 * Two jobs, and the first one runs unconditionally:
 *
 *   1. Assert the blur model's constants are identical in all three places they
 *      exist — TypeScript, the iOS C header, and the Kotlin object. Comments
 *      throughout the library promise these stay in sync; this is what enforces
 *      it, so a drift fails CI instead of silently splitting the platforms.
 *
 *   2. Given a Figma reference export and a device screenshot of the same scene,
 *      measure the actual Gaussian sigma in each and report the error. This is
 *      how FIGMA_BLUR_TO_SIGMA and IOS_SIGMA_TO_INPUT_RADIUS were calibrated and
 *      how you re-calibrate them if a future OS moves.
 *
 * Usage:
 *   node parity/measure.mjs
 *   node parity/measure.mjs --reference figma-40.png --actual ios-40.png --blur 40
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readPng, luminanceRow } from './png.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// --- 1. constants in sync ------------------------------------------------

function extract(file, patterns) {
  const text = readFileSync(join(root, file), 'utf8');
  const found = {};
  for (const [key, re] of Object.entries(patterns)) {
    const m = text.match(re);
    if (!m) throw new Error(`${file}: could not find ${key}`);
    found[key] = Number(m[1]);
  }
  return found;
}

function checkConstants() {
  const ts = extract('src/core/blurMath.ts', {
    figmaToSigma: /FIGMA_BLUR_TO_SIGMA\s*=\s*([\d.]+)/,
    skiaSlope: /SKIA_RADIUS_TO_SIGMA_SLOPE\s*=\s*([\d.]+)/,
    skiaIntercept: /SKIA_RADIUS_TO_SIGMA_INTERCEPT\s*=\s*([\d.]+)/,
    targetSigma: /TARGET_DOWNSCALED_SIGMA_PX\s*=\s*([\d.]+)/,
    maxDownsample: /MAX_DOWNSAMPLE\s*=\s*([\d.]+)/,
  });

  const ios = extract('ios/FigmaBlurMath.h', {
    figmaToSigma: /kFigmaBlurToSigma\s*=\s*([\d.]+)/,
    targetSigma: /kTargetDownscaledSigmaPx\s*=\s*([\d.]+)/,
    maxDownsample: /kMaxDownsample\s*=\s*([\d.]+)/,
  });

  const android = extract('android/src/main/java/com/figmablur/BlurMath.kt', {
    figmaToSigma: /FIGMA_BLUR_TO_SIGMA\s*=\s*([\d.]+)/,
    skiaSlope: /SKIA_SLOPE\s*=\s*([\d.]+)/,
    skiaIntercept: /SKIA_INTERCEPT\s*=\s*([\d.]+)/,
    targetSigma: /TARGET_DOWNSCALED_SIGMA_PX\s*=\s*([\d.]+)/,
    maxDownsample: /MAX_DOWNSAMPLE\s*=\s*([\d.]+)/,
  });

  const failures = [];
  const compare = (key, a, an, b, bn) => {
    if (a[key] === undefined || b[key] === undefined) return;
    if (a[key] !== b[key]) {
      failures.push(`${key}: ${an}=${a[key]} but ${bn}=${b[key]}`);
    }
  };

  for (const key of ['figmaToSigma', 'targetSigma', 'maxDownsample']) {
    compare(key, ts, 'ts', ios, 'ios');
    compare(key, ts, 'ts', android, 'android');
  }
  for (const key of ['skiaSlope', 'skiaIntercept']) {
    compare(key, ts, 'ts', android, 'android');
  }

  if (failures.length) {
    console.error('Blur model out of sync across platforms:');
    for (const f of failures) console.error(`  - ${f}`);
    return false;
  }
  console.log('Blur model constants agree across TypeScript, iOS and Android.');
  console.log(`  Figma blur -> sigma        ${ts.figmaToSigma}`);
  console.log(`  Skia radius -> sigma       ${ts.skiaSlope} * r + ${ts.skiaIntercept}`);
  console.log(`  Downscale target sigma     ${ts.targetSigma}px (max ${ts.maxDownsample}x)`);
  return true;
}

// --- 2. measure a rendered blur -----------------------------------------

/**
 * Recover the Gaussian sigma from a blurred step edge.
 *
 * A step convolved with a Gaussian is that Gaussian's CDF, so the derivative of
 * the edge profile *is* the Gaussian. Rather than fitting a curve, we take that
 * derivative and compute its standard deviation directly — no solver, no initial
 * guess, and it degrades gracefully on a noisy screenshot.
 */
function measureSigma(png, rowIndex) {
  const row = luminanceRow(png, rowIndex ?? Math.floor(png.height / 2));

  const d = new Float64Array(row.length - 1);
  let total = 0;
  for (let i = 0; i < d.length; i++) {
    d[i] = Math.abs(row[i + 1] - row[i]);
    total += d[i];
  }
  if (total < 1e-6) throw new Error('no edge found in this row — is the crop right?');

  let mean = 0;
  for (let i = 0; i < d.length; i++) mean += (i + 0.5) * (d[i] / total);

  let variance = 0;
  for (let i = 0; i < d.length; i++) {
    const dx = i + 0.5 - mean;
    variance += dx * dx * (d[i] / total);
  }
  return { sigma: Math.sqrt(variance), edgeAt: mean };
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (argv[i]?.startsWith('--')) args[argv[i].slice(2)] = argv[i + 1];
  }
  return args;
}

function main() {
  const ok = checkConstants();
  const args = parseArgs(process.argv.slice(2));

  if (args.reference && args.actual) {
    const ref = measureSigma(readPng(args.reference), args.row && Number(args.row));
    const act = measureSigma(readPng(args.actual), args.row && Number(args.row));
    const error = ((act.sigma - ref.sigma) / ref.sigma) * 100;

    console.log('');
    console.log(`  reference sigma  ${ref.sigma.toFixed(2)}px  (${args.reference})`);
    console.log(`  actual sigma     ${act.sigma.toFixed(2)}px  (${args.actual})`);
    console.log(`  error            ${error >= 0 ? '+' : ''}${error.toFixed(1)}%`);

    if (args.blur) {
      const figmaBlur = Number(args.blur);
      console.log('');
      console.log(`  implied FIGMA_BLUR_TO_SIGMA = ${(ref.sigma / figmaBlur).toFixed(4)}`);
      console.log('  (set this in src/core/blurMath.ts and mirror it to iOS and Android)');
    }

    // 2% is roughly where a sigma difference stops being visible side by side.
    if (Math.abs(error) > 2) {
      console.error('\nBlur does not match the reference within 2%.');
      process.exit(1);
    }
  }

  process.exit(ok ? 0 : 1);
}

main();
