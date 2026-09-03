import React from 'react';
import { StyleSheet, View } from 'react-native';
import { FigmaBlurView } from 'react-native-figma-blur';

/**
 * A mesh-gradient backdrop, built out of the library itself.
 *
 * Blur needs something worth blurring. Flat colour bands make a good measurement
 * fixture but a poor showcase, so this lays down a handful of saturated discs and
 * runs a very large layer blur over them — which is exactly what a mesh gradient
 * is. The discs deliberately overhang the screen on every side so the blur's
 * falloff happens off-canvas rather than darkening the edges.
 */
const BLOBS: Array<{ color: string; size: number; top: number; left: number }> = [
  { color: '#FF2D55', size: 460, top: -160, left: -140 },
  { color: '#FF9500', size: 380, top: -60, left: 190 },
  { color: '#5E5CE6', size: 520, top: 180, left: -180 },
  { color: '#0A84FF', size: 420, top: 300, left: 170 },
  { color: '#30D158', size: 400, top: 560, left: -120 },
  { color: '#BF5AF2', size: 460, top: 640, left: 160 },
  { color: '#64D2FF', size: 360, top: 880, left: -60 },
];

export function Mesh() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={styles.base} />
      <FigmaBlurView blurMode="layer" blurRadius={180} style={StyleSheet.absoluteFill}>
        {BLOBS.map(blob => (
          <View
            key={`${blob.color}${blob.top}`}
            style={{
              position: 'absolute',
              width: blob.size,
              height: blob.size,
              borderRadius: blob.size / 2,
              backgroundColor: blob.color,
              top: blob.top,
              left: blob.left,
            }}
          />
        ))}
      </FigmaBlurView>
    </View>
  );
}

const styles = StyleSheet.create({
  base: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#0B0B14' },
});
