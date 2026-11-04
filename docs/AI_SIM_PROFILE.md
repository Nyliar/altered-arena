# Where the AIs' simulation time goes

Profile of the deck AI and the imitation AI on the translated engine (`rules/`), 2026-11-04, M4 Pro,
one thread. The server path was profiled before (`docs/PERFORMANCE.md`); the AIs' path never was.

## How to measure

```bash
CARGO_PROFILE_RELEASE_DEBUG=line-tables-only cargo build --release -p altered-imitate --example simbench
./target/release/examples/simbench deck 6          # deck AI D06 vs deck AI D01, seeds 1..6
./target/release/examples/simbench imitation 2     # imitation AI (BZH - Dodouce, D06) vs deck AI D01
./target/release/examples/simbench bot 4           # simple bot both seats
```

Each run prints the time per game and per decision and a checksum of the games (winner, day,
answers of each seat). The games are deterministic: a change meant to make things faster only
must keep the checksum.

Profile a run with macOS `sample`, then read it with the scripts of `tools/prof/`:

```bash
./target/release/examples/simbench deck 6 & sleep 1; sample $! 18 -mayDie -file deck.sample
python3 tools/prof/inclusive.py deck.sample 60 [REGEX]   # inclusive share per function
python3 tools/prof/callers.py deck.sample REGEX           # who calls the frames matching REGEX
```

## Baseline

| Run | Time per game | Time per decision | Checksum |
| --- | --- | --- | --- |
| `simbench deck 6` | 5.9 s | 62 ms (572 decisions) | `1229a6b728bf411c` |
| `simbench imitation 2` | 8.5 s | 82 ms (207 decisions, both seats) | `2ca7924274f17f8f` |
| `simbench bot 4` | 0.13 s | | `09e90d337f4a60ef` |

Engine operations, mid-game (`ai/examples/prof`): copy of a game 7–8 µs, decision 0.05 ms, view
0.25–0.30 ms, answer 0.25–0.6 ms, one fast-policy step 0.5–1 ms.

## Deck AI (`simbench deck`)

Share of the worker thread (inclusive):

| Part | Share |
| --- | --- |
| `Ai::choose` (all of the AI) | 97 % |
| End-of-day rollouts (`rollout_day`): 4 best candidates x 2 copies, up to 80 fast-policy steps | **63 %** |
| One-ply simulations (`finish_action`) | 4 % |
| Useless-play filter (`useful::drop_useless_plays`) | 10 % |
| Views built for the evaluation (`v1::view_state`) | 8 % |
| Fast policy's own choice (`bot::decide`) | 10 % |

Almost all of it is the engine answering (`v1::call_action` 69 %). Inside the engine:

| Engine part | Share |
| --- | --- |
| Choices of the current node (`node::get_choices` / `compute_choices`) | 39 % |
| Targetable cards (`target::get_targetable_cards`) | **29 %** |
| `is_optional` / `is_doable` of nodes and actions | 19 % / 12 % |
| Card flow trees rebuilt (`activate_card::get_flow_tree`) | 17 % |
| Card properties (`card::get_impl`, `PropMap::get`) | 12 % |

What it is made of:

| Cost | Share | Main sources |
| --- | --- | --- |
| `malloc` / `free` (self) | ~35 % | everything below |
| Copies of `serde_json::Value` (maps, arrays) | ~18 % | `globals::set` / `get`, `card::get_impl`, `node::to_array`, `build_tree`, `node::info`, `check_reaction`, `get_ctx_arg` |
| Drops of `serde_json::Value` | ~17 % | `get_flow`, `get_reactions`, `build_tree`, `engine::save`, `check_reaction` |
| SipHash (std `HashMap` default hasher) | ~7 % | `PropMap::get` (most), `node::info`, `get_ctx_arg`, `get_arg` |

The profile is flat: no single function is the problem; the engine spends its time copying and
freeing JSON values while it recomputes the same answers (choices, targets, flow trees) again and
again.

## Imitation AI (`simbench imitation`)

The imitation seat is 85 % of the run (the rest is the opposing deck AI):

| Part | Share of the run |
| --- | --- |
| The deck AI's pick, a feature (`features::search_pick`): one full deck AI search **per ensemble member** (2) | **59 %** |
| Features (`features::extract`): each candidate played and finished, views | 21 % |
| Views (`v1::build_view`) | 12 % |
| Useless-play filter | 6 % |

## Levers, by expected gain

Behaviour-preserving (checksum unchanged; goldens unchanged):

1. **Fewer JSON copies in the engine.** Borrow instead of clone in `globals::get`, `card::get_impl`,
   `node::info`, `get_ctx_arg`; build each card class's flow tree once and share it (`Arc`);
   avoid `to_array` / `build_tree` copies. Target: most of the ~35 % spent in copies, drops and
   their allocations.
2. **A fast hasher** for `PropMap` and the engine's string maps (Fx/ahash instead of SipHash): ~5 %.
3. **Memoize within a request** what does not change between two questions on the same state:
   targetable cards (29 %), `is_optional` / `is_doable`, the choices of a node.
4. **Evaluate positions from the game, not from a JSON view** (8–12 %): `eval::evaluate` and the
   imitation features read the view; a typed accessor on `Game` would skip building it.

Behaviour-changing (measured by tournament, not by the checksum):

5. **One deck AI search per imitation decision instead of one per ensemble member**: about a third
   of the imitation AI's time. The second member then reads a pick made on the first member's
   redeal; check the held-out agreement (`imitate cv`) and the tournament.
6. **Cheaper rollouts** (63 % of the deck AI): fewer steps, fewer copies, or a cheaper policy.
7. **Merge the useless-play filter into the search**: the search already plays every candidate.

Structural: a typed engine (cards, nodes and globals as Rust types instead of JSON values), which
`docs/PERFORMANCE.md` estimated as the way to the old engine's speed. It needs the
non-regression net below.

## Results of the speed work (branch `perf/sim-profiling`)

Every step passed `tools/perf_gate.sh check` against the reference recorded at `a77f168`: the
goldens file by file (7253/7263, the same 10 known differences), the rules tests, `bot_bench`'s
checksum and `simbench`'s three checksums, all identical. Gains against the previous commit: the
first three by wall time (`tools/perf_time.sh`, best of 3, idle machine), the others by CPU time
(`tools/perf_ab.sh`, alternated runs, median of 3) because another session's tournament was then
loading the machine; a few points are noise.

| Commit | Change | Deck AI | Imitation AI | Simple bot |
| --- | --- | --- | --- | --- |
| `bbdd9b6` | Fx hasher for card properties, class data, globals | -3 % | -2 % | |
| `dfc2263` | Card effect flow memoized per node in an evaluation scope | -10 % | -8 % | -20 % |
| `ef9a8a0` | Targetable cards memoized per node in an evaluation scope | -11 % | -4 % | |
| `a760eb3` | `build_tree` without copying subtrees; `globals::set` without a copy | -1 % | -10 % | -9 % |
| `e6bc2a4` | Useless-play filter simulates Spells only | -3 % | -7 % | 0 |
| `c75fb57` | AIs' views without the decision | 0 | -3 % | 0 |

Overall, against `a77f168` (A/B, CPU time, median of 3): deck AI 0.66x, imitation AI 0.70x,
simple bot 0.74x.

Behaviour-changing, judged by a match against the current AI (`imitate/examples/ab_imitation`):

- **One deck AI search per imitation decision** (`Imitator::share_search`, off by default): 0.61x
  the CPU per decision (95 ms instead of 155 ms), but it won 41 of 100 games against the current
  imitation AI (BZH - Dodouce, D06 mirror; 95 % interval 31-51 %). Likely weaker: left off.

## Non-regression for deeper changes

Today's net: the PHP goldens (`goldens/`, 6336 files: every card on three boards with every
branch, 400 random games, the BGA replays), 52 unit tests, the bot-vs-bot checksum
(`rules/examples/bot_bench.rs`) and now `simbench`'s checksums. The goldens compare a canonical
state (zones, marks, positions) and the decision at every step, not the engine's internal data:
any engine that produces the same canonical state passes them, whatever its representation.

To change the representation in depth, make the current engine the reference for the next one:

1. **Keep the PHP goldens as the specification.** They are recorded files; they stay valid for any
   engine. Every change must still pass all of them.
2. **Differential testing against a pinned reference build.** Keep today's engine as a frozen crate
   (`altered-rules` at a tagged commit, renamed) and run both engines side by side on generated
   games: random, simple-bot and AI games, plus every branch of every decision for a sample of
   states. At every step compare the decision and the canonical state (or a hash of it). This
   covers millions of steps an hour, far more than the PHP goldens, and needs no PHP. A divergence
   is shrunk to the first step that differs and kept as a new golden.
3. **Same randomness.** Both engines must draw the same numbers in the same order (PHP's Mersenne
   Twister, shuffles, dice) and iterate in the same order where the PHP does (insertion-ordered
   maps): the comparison is exact, so any drift shows at once.
4. **Card-by-card coverage.** The PHP boards (`server/tools/explore.php`) put each card in hand
   or Reserve with a rich board; a Rust position builder (also needed for the AIs' position
   tests) would let the differential run explore every card on many boards.
5. **Intended changes** (a PHP bug fixed on purpose, a rule clarified): listed with the goldens they
   change, and those goldens re-recorded from the new engine after review.
6. **AI level.** A pure speed change keeps `simbench`'s checksums. A change of the AIs' behaviour is
   judged by tournament (enough games per pair: 100+ to see 10 points) and by the AIs' agreement
   with the recorded players.

With 2 and 3 in place, the engine can move off JSON values module by module (globals, card
properties, nodes, action arguments), each step checked against the reference on every generated
game.
