#!/usr/bin/env bash
# Timings of the AIs' simulations, best of N runs (default 3) of each simbench workload, one at a
# time, plus the bot-vs-bot benchmark: tools/perf_time.sh [N]
set -euo pipefail
n=${1:-3}
cargo build --release -q -p altered-imitate --example simbench -p altered-rules --example bot_bench
for run in "deck 6" "imitation 2" "bot 20"; do
  best=""
  for _ in $(seq "$n"); do
    s=$(./target/release/examples/simbench $run 2>/dev/null | sed -E 's/.*: ([0-9.]+) s\/game.*/\1/')
    if [ -z "$best" ] || [ "$(echo "$s < $best" | bc)" = 1 ]; then best=$s; fi
  done
  echo "$run: $best s/game (best of $n)"
done
./target/release/examples/bot_bench 2>/dev/null | grep checksum
