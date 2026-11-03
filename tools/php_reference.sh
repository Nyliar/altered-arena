#!/bin/sh
# Extracts the reference PHP engine (AlteredBGA origin/master, without unmerged branches) to
# ../AlteredBGA-ref, applies the rules changes of the arena (docs/patches, listed below: the Rust
# card data is exported from the patched engine) and restarts the oracle on it (.env sets GAME_DIR
# for docker compose)
cd "$(dirname "$0")/.."
(cd ../AlteredBGA && git fetch -q origin && git log -1 --format='reference: %h %ad %s' --date=short origin/master)
rm -rf ../AlteredBGA-ref && mkdir ../AlteredBGA-ref
(cd ../AlteredBGA && git archive origin/master) | tar -x -C ../AlteredBGA-ref
for p in target-then-base-cost; do
  (cd ../AlteredBGA-ref && patch -s -p1 < ../altered-arena/docs/patches/$p.patch) || { echo "patch $p does not apply"; exit 1; }
done
grep -q GAME_DIR .env 2>/dev/null || echo "GAME_DIR=../AlteredBGA-ref" >> .env
docker compose up -d server
