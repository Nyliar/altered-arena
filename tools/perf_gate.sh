#!/usr/bin/env bash
# Non-regression gate for changes meant to keep the engine's and the AIs' behaviour (speed work).
#
#   tools/perf_gate.sh record DIR   # record the reference results in DIR (run on the reference code)
#   tools/perf_gate.sh check DIR    # run everything again and compare with DIR
#
# Checked, all of which must be identical to the reference:
#   - the golden files (server/goldens: PHP oracle recordings), file by file, with every failure
#     message (the known differences stay the same, nothing else fails);
#   - the rules crate's tests;
#   - the bot-vs-bot checksum of rules/examples/bot_bench.rs (final states of 40 games);
#   - simbench's checksums (imitate/examples/simbench.rs): simple bot, deck AI, imitation AI games,
#     whose decisions depend on every simulated answer of the engine.
# Timings are printed next to the reference ones.
set -euo pipefail
mode=${1:?record or check}
dir=${2:?directory of the reference results}
mkdir -p "$dir"
out=$(mktemp -d)

cargo build --release -q -p goldens -p altered-rules --example bot_bench
cargo build --release -q -p altered-imitate --example simbench

echo "goldens..."
./target/release/goldens server/goldens -v > "$out/goldens.raw" 2>&1 || true
grep -v '^[0-9]*/[0-9]* files pass' "$out/goldens.raw" > "$out/goldens.txt"
grep 'files pass' "$out/goldens.raw" | sed -E 's/ \([0-9.]+s\)//' > "$out/goldens.summary"
echo "rules tests..."
cargo test --release -q -p altered-rules > "$out/tests.raw" 2>&1 || true
grep -E '^test result|FAILED|panicked' "$out/tests.raw" | sed -E 's/; finished in [0-9.]+s//' > "$out/tests.txt"
echo "bot_bench..."
./target/release/examples/bot_bench 2>/dev/null | grep checksum | sed -E 's/.*checksum //' > "$out/bot_bench.txt"
echo "simbench..."
: > "$out/simbench.txt"
: > "$out/timings.txt"
for run in "bot 4" "deck 6" "imitation 2"; do
  line=$(./target/release/examples/simbench $run 2>/dev/null)
  echo "$line" | sed -E 's/.*checksum //' | sed "s/^/$run: /" >> "$out/simbench.txt"
  echo "$line" >> "$out/timings.txt"
done
grep 'files pass' "$out/goldens.raw" >> "$out/timings.txt"

if [ "$mode" = record ]; then
  cp "$out"/{goldens.txt,goldens.summary,tests.txt,bot_bench.txt,simbench.txt,timings.txt} "$dir/"
  echo "recorded in $dir:"
  cat "$dir/goldens.summary" "$dir/bot_bench.txt" "$dir/simbench.txt" "$dir/timings.txt"
  exit 0
fi

fail=0
for f in goldens.txt goldens.summary tests.txt bot_bench.txt simbench.txt; do
  if ! diff -q "$dir/$f" "$out/$f" > /dev/null; then
    echo "DIFFERS: $f"
    diff "$dir/$f" "$out/$f" | head -20
    fail=1
  fi
done
echo "--- reference timings"; cat "$dir/timings.txt"
echo "--- now"; cat "$out/timings.txt"
if [ $fail = 0 ]; then echo "GATE OK"; else echo "GATE FAILED"; exit 1; fi
