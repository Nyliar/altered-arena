#!/usr/bin/env bash
# A/B timing of the AIs' simulations: this checkout against a reference checkout (built at the
# commit to compare with), runs alternated so both see the same machine load, CPU time (user +
# system) rather than wall time. Prints each workload's median CPU seconds and the ratio.
#   tools/perf_ab.sh REF_CHECKOUT [ROUNDS]     e.g. tools/perf_ab.sh ../perf-base 5
set -euo pipefail
ref=${1:?reference checkout}
rounds=${2:-5}
cargo build --release -q -p altered-imitate --example simbench
(cd "$ref" && cargo build --release -q -p altered-imitate --example simbench)
cpu() { # CPU seconds of one run: dir, workload
  ( cd "$1" && /usr/bin/time -p ./target/release/examples/simbench $2 2>&1 >/dev/null ) | awk '/^user|^sys/ {s += $2} END {print s}'
}
median() { sort -n | awk '{a[NR] = $1} END {print (NR % 2) ? a[(NR + 1) / 2] : (a[NR / 2] + a[NR / 2 + 1]) / 2}'; }
for w in "deck 4" "imitation 1" "bot 20"; do
  : > /tmp/perf_ab_ref.$$; : > /tmp/perf_ab_new.$$
  for _ in $(seq "$rounds"); do
    cpu "$ref" "$w" >> /tmp/perf_ab_ref.$$
    cpu . "$w" >> /tmp/perf_ab_new.$$
  done
  r=$(median < /tmp/perf_ab_ref.$$); n=$(median < /tmp/perf_ab_new.$$)
  echo "$w: reference ${r}s, now ${n}s CPU (median of $rounds), ratio $(echo "scale=3; $n / $r" | bc)"
done
rm -f /tmp/perf_ab_ref.$$ /tmp/perf_ab_new.$$
