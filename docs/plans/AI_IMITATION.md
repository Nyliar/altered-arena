# Night run: one AI per tournament player, imitating their decisions

Unattended run (one night, no human input). Goal: for each of the 37 players of BGA tournament
617607, an AI that plays that player's deck and makes the choices that player would make. The
tournament replays are the evaluation set; the AIs must stay general enough to play any match.

## Data

- `private/tournament-617607/native/*.replay.json`: 70 verified native replays (`replay::native`,
  see `docs/REPLAYS.md`). `native::start` + `native::apply` rebuild the game before any step; each
  step has the player (`p`, 2001/2002) and the recorded v1 answer (`a`). `names` maps seats to
  players.
- `private/tournament-617607/decks.json`, `table_decks.json`: decklists (D01..D37) and which deck
  each player played. Each player played one deck.
- 37 players, 1 to 6 games each, about 7 500 decisions with two or more legal answers.
- Baseline from the previous night (42 replays, `passes/AGREE_3.json`): the current AI (`ai/`,
  `aitool`) picks the player's answer 42% of the time, `SimpleBot` 35%.

## Protocol

### 1. Decision dataset (once, then on each feature change)

For every step of every native replay where the acting player had two or more legal answers
(`altered_ai::legal::candidates`):

- rebuild the game at that step; the AI sees only what that player saw (`play::Observation`: own
  hand, board, public information; never the opponent's hand or any deck order);
- for each candidate, apply it on a clone and compute a feature vector (below);
- label: which candidates are equivalent to the recorded answer. Equivalent = same resulting state
  (compare positions/digest as `replay::sig` does, so two copies of the same card count as the
  same choice).

Write the dataset to `private/tournament-617607/imitation/dataset.*` (binary or JSONL), so training
never touches the engine. Run extraction in parallel on all cores.

### 2. Features (generic only)

Start from what exists, as deltas between the candidate's resulting position and the current one:

- the terms of `eval::Weights` (progress, dusk win, margins, board, hand, Reserve, Mana, ready Mana,
  landmarks, empty expeditions), each as a separate feature;
- action type (play / Mana / endTurn / select / choice / location / support / cleanup / pass...),
  card cost, card type, card family/class, hand or Reserve origin, target expedition;
- context: day, Mana available before and after, cards in hand, phase;
- card identity features (class name) so per-card preferences (play, put in Mana, keep) are
  learnable;
- optional: the existing search value (`search::Ai` rollout score) as one feature, if its cost fits.

Forbidden anywhere in the code: table ids, move numbers, player names, or any rule keyed to one
game. Player-specific behaviour lives only in numbers in the per-player parameter files.

### 3. Model

Linear scoring of each candidate over the features, softmax over the candidates of a decision,
trained by maximum likelihood on the labels (multinomial logit / learning to rank). Two levels:

- a shared base model trained on all players' decisions;
- per-player offsets on top of it, with L2 regularization toward zero (toward the base). The
  strength is chosen by cross-validation, so a player with 1-2 games stays close to the base.

A player's AI = shared weights + that player's offsets + that player's deck. It must plug into
`play::Agent` so it can play full games (`play::play_game`), choosing the top-scoring candidate
(an option for sampling from the softmax).

### 4. Score (the number we optimize)

Leave-one-game-out cross-validation per player: train with one of the player's games held out
(the shared model is retrained without that game too), predict every decision of the held-out
game, repeat for each game. Report per player and overall:

- top-1 agreement (the model's best candidate is equivalent to the real answer): main metric;
- top-3 agreement; mean log-likelihood of the real answer;
- by decision kind (turn, select/Mana, choice, location, cleanup, ...) and by day;
- the training-set agreement alongside, to see overfitting.

Overall score = mean of the per-player held-out top-1 (each player weighted equally), plus the
decision-weighted mean.

### 5. Improvement loop (rest of the night)

Repeat until morning:

1. List the held-out decisions the models miss most, grouped across players by kind and situation.
2. Propose one generic feature or model change that would explain them.
3. Re-extract if needed, retrain, rescore.
4. Keep the change only if the overall held-out score rises and no more than a quarter of the
   players lose more than 2 points. Otherwise revert.
5. Append to `private/tournament-617607/imitation/JOURNAL.md`: change, scores before/after,
   kept or reverted, why.

Also tune training hyperparameters (regularization strengths, learning rate, feature scaling) by
the same held-out score.

### 6. Gates before the final AIs

- Each of the 37 AIs plays full games against the other decks (at least 20 games per AI, mixed
  opponents, seeds fixed): no panic, no stuck loop, games finish.
- Each AI's win rate against the current deck AI (`ai/params/DXX.json`) on the same deck matchups
  is reported; flag any AI that collapses (wins under 15%) as playing absurdly off-dataset.

### 7. Deliverables (morning)

- `private/tournament-617607/imitation/players/<player>.json`: the 37 AIs (shared weights version
  + offsets + deck id). Real names stay in `private/` (git-ignored).
- `private/tournament-617607/imitation/REPORT.md`: table per player (games, decisions, baseline
  current AI, baseline SimpleBot, final held-out top-1, top-3, by kind), overall scores, the most
  frequent remaining misses, the gates' results, the journal summary.
- The generic code (dataset extraction, features, training, imitation agent, `aitool` commands)
  committed; `docs/ai/IMITATION.md` describing the method without player names.

## Constraints

- Commit with `git -c user.name=Yutsa -c user.email=edouard.willisseck@gmail.com commit ...`,
  small commits as milestones land. Do not push.
- Never commit anything under `private/` or anything naming real players.
- Do not modify `../AlteredBGA-ref`; do not run `tools/php_reference.sh`; no BGA/browser access is
  needed.
- Use all CPU cores. Long jobs run in the background with logs in `private/tournament-617607/imitation/logs/`.
- The rules engine (`rules/`) stays untouched; if a replay step cannot be rebuilt, skip that
  decision and count it.
- Keep running without asking questions; when a choice is unclear, pick the option the held-out
  score favours and note it in the journal.
