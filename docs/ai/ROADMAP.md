# AI roadmap: towards AIs that beat the best players

Goal: AIs that beat the strongest Altered players, on their own decks and on the decks of the
format. This document lists every lead for getting there, where things stand (2026-11-04), and in
what order to work. Each lead is kept only if it wins: see "Measure first".

## Where we are

Two kinds of AI, described in `docs/ai/IMITATION.md` and `ai/src/search.rs`:

- **Deck AIs** (`deck:DXX`): play each candidate on a copy of the game redealt from the player's
  point of view, finish the action with the simple bot (Bot.php), score the position with a
  hand-written formula of 13 weights (`ai/src/eval.rs`), and roll the 4 best turn candidates out
  to the end of the day. Per-deck card priors (`ai/params/DXX.json`) fit on the tournament
  replays. 48.6 % agreement with the players' real decisions.
- **Imitation AIs** (`imitation:STEM`): a linear softmax over the candidates of each decision,
  ~6,000 generic features (position changes, cards, context, the deck AI's opinion), shared
  weights plus small per-player offsets, trained on 7,702 decisions of 74 tournament games.
  58.6 % held-out agreement (88 % top-3).
- Fixed rules on top of both: Haven, Bravos Bastion taps only before a Reserve Character
  (`search::HavenRule`); no card played for nothing (`ai/src/useful.rs`); a card that destroys
  an opponent's card (to the discard pile) is held when a clearly stronger target will be there at
  the next turn (`ai/src/hold.rs`, with a hand-written card strength estimate: Hand Cost, rarity,
  abilities, statistics). Tempo removals (back to Reserve or hand) and Characters are not held:
  holding them lost games.

Strength (Treyst round robin, 20 games per pair, 2026-11-04): imitation AIs 68–70 % wins, deck AIs
14–41 %. Deck AI D04 has no card priors and wins 14 %.

Engine speed (M4 Pro, one core): ~2.5 ms per decision with a trivial agent, 125 ms per simple-bot
game (~350,000 games per hour on 12 cores), 5.5 s per deck AI game, ~21 s per imitation AI game.
Where the time goes: `docs/AI_SIM_PROFILE.md` on branch `perf/sim-profiling` (not merged yet).

Tools: `imitate/examples/tournament.rs` (round robin), `imitate/examples/useless_check.rs`,
`imitate/examples/haven_check.rs`, position tests (`docs/ai/POSITIONS.md`), recorded arena games
(`altered_ai::record`).

## Measure first

Nothing is kept on intuition. Before any lead:

1. **Larger, paired tournaments.** 20 games per pair gives about ±11 points: a 5-point gain is
   invisible. Use 100+ games per pair, the same seeds for both versions, seats alternated, and
   report confidence intervals. Keep a fixed reference field (today's AIs, frozen) to measure
   every new version against.
2. **A rating.** An Elo (or TrueSkill) table over every AI version ever kept, so progress is one
   number and regressions show.
3. **Position tests** (`docs/ai/POSITIONS.md`): every mistake seen in a game becomes a test; the
   suite runs on every change. Grow it from games against humans.
4. **Agreement with strong players** (`imitate cv`): a secondary signal, never the goal (imitating
   a mistake is not progress).
5. **Against humans.** The final judge: games against strong players on the arena server, with the
   games recorded. Start as soon as an AI wins clearly against our whole AI field.

## Leads

Effort: S (hours), M (days), L (weeks). Gain: expected, to be measured.

### 1. Quick wins

| Lead | Effort | Why |
| --- | --- | --- |
| Fit D04's card priors | S | D04 has none, wins 14 %. A session card was proposed for it. |
| Tune the deck AI's search budget per deck: `copies` (1 today), `rollouts`, `rollout_copies`, `max_candidates` | S | One redeal per decision makes its judgement noisy. |
| Tune each deck's evaluation weights by tournament against the imitation AIs (evolution strategy) | M | The weights are hand-set; the imitation AIs are now harder sparring partners than the deck AIs. |
| Extend the useless-play check to abilities (`tap`, `support`) with care for effects stored outside the view | S | Same mistake class as cards played for nothing. |
| Give the simple bot the useless-play filter | S | It plays Sticky Note Seals for nothing, and it is the policy every simulation uses. |

### 2. Engine speed (prerequisite for search and self-play)

Detailed in `docs/AI_SIM_PROFILE.md`. Behaviour-preserving, checked by the goldens and the
`simbench` checksums:

| Lead | Effort | Gain |
| --- | --- | --- |
| Fewer JSON copies in the engine (borrow in `globals::get`, `card::get_impl`, `node::info`; share card flow trees) | M | most of the ~35 % spent copying and freeing values |
| Fast hasher (Fx/ahash) for property maps | S | ~5 % |
| Memoize targetable cards, `is_optional` / `is_doable`, node choices within a request | M | targeting alone is 29 % |
| Evaluate from the game, not from a JSON view | M | 8–12 % |
| One deck AI search per imitation decision instead of one per ensemble member | S | a third of the imitation AI's time (behaviour changes: measure) |
| Merge the useless-play filter into the search (it already plays every candidate) | S | 10 % of the deck AI |
| **Typed engine**: cards, nodes, globals as Rust types instead of JSON values, with the current engine as the reference for differential tests on generated games | L | 10–100× (the first, from-scratch engine played a whole game in 0.31 ms) |

Target: under 0.1 ms per decision. Self-play at scale needs millions of games.

### 3. Better deck AIs (search)

| Lead | Effort | Why |
| --- | --- | --- |
| A better rollout policy: a fast distilled version of the imitation model instead of the simple bot | M | Every simulation is only as good as the policy that plays it out; the simple bot plays badly. |
| A learned evaluation: positions from many AI games labelled with the winner, a model predicting the win probability from position features | M | Replaces 13 hand-set weights; knows that a card in hand is worth more on day 2 than on day 5. Needs no human data. |
| Information-set MCTS (determinized MCTS over redeals of the hidden cards) instead of 1-ply plus 4 rollouts | L | Real lookahead within a turn and across the opponent's answers. |
| Opponent modelling: draw the opponent's hidden cards from their decklist and what they did (a card held back is likely a reaction) | M | Today's redeal is uniform over the hidden pool. |

### 4. Better imitation AIs (learning from humans)

| Lead | Effort | Why |
| --- | --- | --- |
| **Search on top of imitation**: keep the imitation model's 3–4 best candidates (88 % contain the player's move) and decide between them by simulation | M | Human intuition picks the candidates, computation decides. The most promising next step. |
| More replays of strong players (BGA, current format) | M | 4–6 games per player today: the per-player offsets are mostly noise. 10× the data makes a small neural model worth trying (the tanh layer tried on 7,702 decisions did not help). Imitation is capped at the level of the players imitated: data alone does not beat them. |
| Use the learned evaluation and the better rollout policy as features | S | Both feed straight into the existing features. |
| Temperature and ensembles tuned for strength, not for agreement | S | The model is fit to agree with players, not to win. |

### 5. Beyond human level (self-play)

The way past the best players, once the engine is fast enough:

| Lead | Effort | Why |
| --- | --- | --- |
| Expert iteration: search (lead 3 or 4) produces better moves than its policy; train the policy on them; repeat | L | Improves without human data, from the imitation model as a starting point. |
| Neural policy and value networks with search, trained by self-play (AlphaZero-style, adapted to hidden information and dice) | L | The approach that beat humans in Go, poker and other games. Needs millions of games, a stable card pool, and a compute budget. |
| Train across many decks at once, card features instead of card names | M | Generalises to new cards and new sets without retraining from scratch. |

### 6. Game knowledge

Players' knowledge is the cheapest source of improvement if it does not become hard-coded rules:

1. **Position tests**: "here the right move is X" or "Y is a mistake". Measures, decides nothing.
2. **Mistake families turned into generic checks**: cards played for nothing (done), an effect
   "until the end of the turn" lost, an expedition left empty for no reason, Mana wasted.
3. **General concepts turned into features**: keep a removal spell until the opponent's big threat,
   tempo matters more in the first days. The model learns how much they weigh, or ignores them.
4. **Card-specific rules** (like Haven): last resort, only where nothing generic works.

## Order

1. Measurement: paired 100-game tournaments, the frozen reference field, the Elo table; grow the
   position tests from games against humans.
2. Quick wins (lead 1) and the behaviour-preserving engine speed-ups (lead 2, first items).
3. Search on top of imitation (lead 4, first item) and the learned evaluation (lead 3).
4. Games against strong players: find what they exploit, turn it into position tests.
5. Typed engine (lead 2, last item), then expert iteration and self-play (lead 5).
