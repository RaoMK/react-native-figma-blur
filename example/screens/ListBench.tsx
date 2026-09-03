import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { FigmaBlurView } from 'react-native-figma-blur';
import { Mesh } from './Mesh';

/**
 * A/B rig for the most common way a blur library gets misused: one blur per cell
 * in a long list.
 *
 * The modes render the same layout three ways so the difference is attributable
 * to the blur and nothing else. Flip between them without rebuilding, and
 * measure each with scripts/bench-android.sh — the delta between modes is the
 * number that transfers between devices; the absolutes do not.
 */
type Mode = 'blur-cells' | 'tint-cells' | 'chrome-only';

const MODES: Array<{ key: Mode; label: string; hint: string }> = [
  { key: 'blur-cells', label: 'blur cells', hint: 'one backdrop blur per row' },
  { key: 'tint-cells', label: 'tint only', hint: 'no capture at all' },
  { key: 'chrome-only', label: 'chrome', hint: 'one blur over the list' },
];

const ROWS = Array.from({ length: 200 }, (_, i) => ({
  id: String(i),
  title: `Row ${i}`,
  sub: 'scroll me and read gfxinfo',
}));

function Row({ mode, title, sub }: { mode: Mode; title: string; sub: string }) {
  const body = (
    <>
      <View style={styles.avatar} />
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowSub}>{sub}</Text>
      </View>
    </>
  );

  // Identical geometry in both branches, so the only variable is whether a
  // backdrop capture happens.
  if (mode === 'blur-cells') {
    return (
      <FigmaBlurView
        blurRadius={40}
        tintColor="rgba(255,255,255,0.18)"
        style={styles.row}
      >
        {body}
      </FigmaBlurView>
    );
  }
  return <View style={[styles.row, styles.rowTinted]}>{body}</View>;
}

export function ListBench() {
  const [mode, setMode] = useState<Mode>('blur-cells');
  const hint = useMemo(() => MODES.find(m => m.key === mode)?.hint ?? '', [mode]);

  return (
    <View style={styles.root}>
      <Mesh />

      <FlatList
        data={ROWS}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <Row mode={mode} title={item.title} sub={item.sub} />
        )}
      />

      {mode === 'chrome-only' ? (
        <FigmaBlurView
          blurRadius={50}
          tintColor="rgba(255,255,255,0.2)"
          style={styles.chrome}
        >
          <Text style={styles.chromeText}>one blur, over the whole list</Text>
        </FigmaBlurView>
      ) : null}

      {/* Solid, and plain views on purpose: the control surface must not add
          captures of its own or it would show up in the measurement, and it has
          to stay readable over whatever row happens to be beneath it. */}
      <View style={styles.controls}>
        <View style={styles.bar}>
          {MODES.map(m => (
            <Pressable
              key={m.key}
              onPress={() => setMode(m.key)}
              style={[styles.chip, mode === m.key && styles.chipOn]}
            >
              <Text style={[styles.chipText, mode === m.key && styles.chipTextOn]}>
                {m.label}
              </Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.hint}>{hint}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0B0B14' },
  list: { paddingTop: 70, paddingHorizontal: 16, paddingBottom: 130, gap: 10 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    height: 74,
    borderRadius: 18,
    paddingHorizontal: 14,
    overflow: 'hidden',
  },
  rowTinted: { backgroundColor: 'rgba(255,255,255,0.18)' },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  rowText: { flex: 1 },
  rowTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },
  rowSub: { color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 2 },
  chrome: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 118,
    borderRadius: 22,
    paddingVertical: 16,
    alignItems: 'center',
    overflow: 'hidden',
  },
  chromeText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  controls: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 14,
    paddingBottom: 30,
    gap: 8,
    backgroundColor: '#0B0B14',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.15)',
  },
  bar: { flexDirection: 'row', gap: 8, justifyContent: 'center' },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  chipOn: { backgroundColor: '#fff' },
  chipText: { color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: '600' },
  chipTextOn: { color: '#0B0B14' },
  hint: {
    textAlign: 'center',
    color: 'rgba(255,255,255,0.6)',
    fontSize: 11,
  },
});
