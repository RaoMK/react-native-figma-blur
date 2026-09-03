#!/usr/bin/env bash
# Scroll a screen and report frame timings, for A/B-ing a change on one device.
#
# The absolute numbers mean nothing across devices — a software-GPU emulator will
# happily report 1000ms frames. The DELTA between two runs on the SAME device is
# the number worth quoting.
#
#   ./scripts/bench-android.sh                          # defaults to the example app
#   ./scripts/bench-android.sh com.yourapp 12           # package, swipe count
set -euo pipefail

PKG="${1:-com.figmablurexample}"
SWIPES="${2:-10}"

command -v adb >/dev/null || { echo "adb not on PATH"; exit 1; }
adb get-state >/dev/null 2>&1 || { echo "no device or emulator attached"; exit 1; }

SIZE=$(adb shell wm size | tr -d '\r' | awk -F'[ x]' '{print $(NF-1), $NF}')
W=$(echo "$SIZE" | cut -d' ' -f1)
H=$(echo "$SIZE" | cut -d' ' -f2)
X=$((W / 2))
FROM=$((H * 3 / 4))
TO=$((H / 4))

echo "package  $PKG"
echo "swipes   $SWIPES  (${X},${FROM} -> ${X},${TO})"
echo

adb shell dumpsys gfxinfo "$PKG" reset >/dev/null
for _ in $(seq 1 "$SWIPES"); do
  adb shell input swipe "$X" "$FROM" "$X" "$TO" 300 >/dev/null
  adb shell input swipe "$X" "$TO" "$X" "$FROM" 300 >/dev/null
done

adb shell dumpsys gfxinfo "$PKG" \
  | grep -E "Total frames rendered|Janky frames|percentile|Number Missed Vsync|Number Slow" \
  | grep -v legacy
