import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { FigmaBlurView, GlassView, Materials } from 'react-native-figma-blur';
import { Mesh } from './Mesh';

const MATERIALS = [
  { name: 'ultraThin', ...Materials.ultraThin },
  { name: 'thin', ...Materials.thin },
  { name: 'regular', ...Materials.regular },
  { name: 'thick', ...Materials.thick },
] as const;

/**
 * The documentation screen: every surface the library makes, composed the way it
 * would actually be used — a translucent nav bar, a grid of materials, glass
 * controls, and a glass tab bar — over a backdrop with enough colour and
 * structure that the differences between them are visible.
 */
export function Gallery() {
  return (
    <View style={styles.root}>
      <Mesh />

      <FigmaBlurView
        blurRadius={50}
        tintColor="rgba(255,255,255,0.18)"
        style={styles.navBar}
      >
        <Text style={styles.navTitle}>Figma Blur</Text>
        <Text style={styles.navSub}>identical on iOS and Android</Text>
      </FigmaBlurView>

      <View style={styles.body}>
        <Text style={styles.section}>Materials</Text>
        <View style={styles.grid}>
          {MATERIALS.map(m => (
            <FigmaBlurView
              key={m.name}
              blurRadius={m.blurRadius}
              tintColor={m.tintColor}
              style={styles.tile}
            >
              <Text style={styles.tileName}>{m.name}</Text>
              <Text style={styles.tileMeta}>blur {m.blurRadius}</Text>
            </FigmaBlurView>
          ))}
        </View>

        <Text style={styles.section}>Liquid Glass</Text>
        <View style={styles.row}>
          <GlassView variant="regular" style={styles.pill}>
            <Text style={styles.pillText}>regular</Text>
          </GlassView>
          <GlassView variant="clear" style={styles.pill}>
            <Text style={styles.pillText}>clear</Text>
          </GlassView>
        </View>

        <Text style={styles.section}>Layer blur</Text>
        {/* Nested deliberately. A layer blur filters the view's own content — its
            fill included — so a card that *is* the blur has nothing left to sit
            on. The card owns the material; the blur wraps only what it hides. */}
        <FigmaBlurView
          blurRadius={40}
          tintColor="rgba(255,255,255,0.16)"
          style={styles.wide}
        >
          <Text style={styles.wideLabel}>Ending</Text>
          <FigmaBlurView blurMode="layer" blurRadius={13} style={styles.spoiler}>
            <Text style={styles.wideValue}>the butler did it</Text>
          </FigmaBlurView>
        </FigmaBlurView>

        <Text style={styles.section}>Per-corner radii</Text>
        <FigmaBlurView
          blurRadius={70}
          tintColor="rgba(255,255,255,0.22)"
          style={styles.sheet}
        >
          <View style={styles.grabber} />
          <Text style={styles.sheetText}>28 / 28 / 6 / 6</Text>
        </FigmaBlurView>
      </View>

      <GlassView variant="regular" style={styles.tabBar}>
        <View style={styles.tabRow}>
          {['Blur', 'Glass', 'Docs'].map((t, i) => (
            <Text key={t} style={[styles.tab, i === 0 && styles.tabActive]}>
              {t}
            </Text>
          ))}
        </View>
      </GlassView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0B0B14' },

  navBar: {
    paddingTop: 64,
    paddingBottom: 18,
    paddingHorizontal: 24,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    overflow: 'hidden',
  },
  navTitle: { color: '#fff', fontSize: 26, fontWeight: '700', letterSpacing: -0.4 },
  navSub: { color: 'rgba(255,255,255,0.72)', fontSize: 13, marginTop: 3 },

  body: { flex: 1, paddingHorizontal: 20, paddingTop: 26, gap: 12 },
  section: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    marginTop: 10,
  },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tile: {
    width: '47.5%',
    height: 92,
    borderRadius: 20,
    padding: 14,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  tileName: { color: '#0B0B14', fontSize: 15, fontWeight: '700' },
  tileMeta: { color: 'rgba(11,11,20,0.6)', fontSize: 12, marginTop: 1 },

  row: { flexDirection: 'row', gap: 12 },
  wide: {
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 14,
    gap: 6,
    overflow: 'hidden',
  },
  wideLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  wideValue: { color: '#fff', fontSize: 19, fontWeight: '600' },
  spoiler: { alignSelf: 'flex-start' },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderBottomLeftRadius: 6,
    borderBottomRightRadius: 6,
    paddingVertical: 14,
    alignItems: 'center',
    gap: 10,
    overflow: 'hidden',
  },
  grabber: {
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.6)',
  },
  sheetText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  pill: {
    flex: 1,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  pillText: { color: '#fff', fontSize: 15, fontWeight: '600' },

  tabBar: {
    marginHorizontal: 20,
    marginBottom: 34,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  tabRow: { flexDirection: 'row', justifyContent: 'space-around' },
  tab: { color: 'rgba(255,255,255,0.55)', fontSize: 14, fontWeight: '600' },
  tabActive: { color: '#fff' },
});
