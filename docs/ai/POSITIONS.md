# Position tests

A position test is a position of a real game where a player must decide, and what a good answer
is (`avoid`: answers the AI must not give; `prefer`: it must give one of them). The AIs are asked
the decision several times (other random streams) and checked. Known mistakes stay fixed, and a
change of an AI can be measured on the positions that matter.

## Where positions come from

The arena server records every game it plays (`altered_ai::record`, field `record` of
`data/games/ID.json`): the game as created, then each answer of a player or an AI and each move of
the engine's bots. Played again from the start, the record rebuilds the game at any point (the
engine is deterministic). Games saved before the record existed (before 2026-11-04) cannot be
rebuilt.

`cargo run --release -p altered-imitate --example record_game -- AI_A AI_B SEED OUT_DIR [off]`
records a game between two AIs in the same format (`off`: without the filter of the plays that do
nothing, to find such plays).

## Tool

```bash
cargo run --release -p altered-imitate --bin positions -- list GAME [--all]
cargo run --release -p altered-imitate --bin positions -- add GAME EVENT NAME --avoid "play:Sticky Note Seals" --note "why"
cargo run --release -p altered-imitate --bin positions -- show NAME
cargo run --release -p altered-imitate --bin positions -- run [FILTER] [--ai ID]... [--n N] [--off]
```

- `list`: the turn decisions of a game (every decision with `--all`): event number, player, day,
  phase, Mana, hand, the answer given; a card played for nothing is marked. GAME is an id of
  `data/games` or a path.
- `add`: writes `ai/positions/NAME.json`, the whole game before that event (so the test does not
  depend on how the game was reached) and the expectation. Each pattern must match a candidate of
  the decision.
- `show`: the candidates, which ones pass, the answer given in the game.
- `run`: every position (whose name contains FILTER), each AI N times (default 5). Default AI: the
  one that played the position. AIs: `deck:DXX`, `imitation:STEM`, `simple`, `random`.

Patterns name cards, not ids: `TYPE[:CARD][@DESTINATION]` (`play:Kelon Elemental@heroExpedition`,
`endTurn`, `tap:Haven, Bravos Bastion`), `select:CARD|CARD` (any order).

## Positions

| Name | What | Expectation |
| --- | --- | --- |
| `sticky-note-seals-no-target-7`, `-8` | No Character or Permanent with Hand Cost 4 or more: Sticky Note Seals would do nothing (D04 vs D06, recorded with the filter off) | avoid `play:Sticky Note Seals` |

On 2026-11-04 (20 tries each): deck AI D04 and Caballo's imitation AI pass both; without the filter
(`--off`) D04 plays the card 2 times of 20 in the first. The simple bot plays it every time in the
second.
