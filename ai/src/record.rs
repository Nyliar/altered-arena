//! The record of a game played on the arena server: the game as created, then every change the
//! server made to it, in order (a player's answer, an AI's answer, the engine's bots). Applied
//! again from the start, the events rebuild the game at any point (the engine is deterministic:
//! its randomness is seeded from the game and the number of acts before each one), so a position
//! of a game played on the server can be looked at again or turned into a position test
//! (`positions`).
//!
//! The server changes its games only through `apply`, so that a replay does exactly what the
//! server did.

use altered_rules::Game;
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Event {
    /// A player's answer (protocol v1), then the cleanups of a decided game
    Answer { pid: u32, body: Value },
    /// An AI seat's answer (with the decision id), then the engine's bots play
    Ai { pid: u32, body: Value },
    /// The engine's bots play until a player must decide
    Bots,
    /// One decision of an engine bot
    BotStep,
}

impl Event {
    /// The player an answer event is from (None: the engine's bots)
    pub fn player(&self) -> Option<u32> {
        match self {
            Event::Answer { pid, .. } | Event::Ai { pid, .. } => Some(*pid),
            _ => None,
        }
    }

    pub fn body(&self) -> Option<&Value> {
        match self {
            Event::Answer { body, .. } | Event::Ai { body, .. } => Some(body),
            _ => None,
        }
    }
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct Record {
    /// The game as created (None: a game saved before records existed)
    pub initial: Option<Game>,
    pub events: Vec<Event>,
}

impl Record {
    pub fn start(g: &Game) -> Record {
        Record { initial: Some(g.clone()), events: vec![] }
    }

    /// The game before event `upto` (after every event when `upto` is past the end)
    pub fn replay(&self, upto: usize) -> Result<Game, String> {
        let mut g = self.initial.clone().ok_or("this game has no record of its moves (saved before records existed)")?;
        for (k, e) in self.events.iter().take(upto).enumerate() {
            apply(&mut g, e).map_err(|err| format!("event {} ({:?}): {}", k, e, err))?;
        }
        Ok(g)
    }
}

/// Plays `e` on `g`, as the server does. For a bot step: whether a bot played.
pub fn apply(g: &mut Game, e: &Event) -> Result<bool, String> {
    match e {
        Event::Answer { pid, body } => {
            g.answer(*pid, body).map_err(|e| e.0)?;
            skip_cleanups(g);
            Ok(true)
        }
        Event::Ai { pid, body } => {
            g.answer(*pid, body).map_err(|e| e.0)?;
            run_bots(g);
            Ok(true)
        }
        Event::Bots => {
            run_bots(g);
            Ok(true)
        }
        Event::BotStep => {
            let played = g.run_bot_step().unwrap_or_else(|e| {
                eprintln!("bots: {}", e.0);
                false
            });
            skip_cleanups(g);
            if !played {
                g.compact();
            }
            Ok(played)
        }
    }
}

fn run_bots(g: &mut Game) {
    if let Err(e) = g.run_bots() {
        eprintln!("bots: {}", e.0);
    }
    skip_cleanups(g);
    // The game now waits for a player
    g.compact();
}

/// Once the winner is known, the Night cleanups are answered for the players: the game ends
fn skip_cleanups(g: &mut Game) {
    if let Err(e) = g.skip_decided_cleanups() {
        eprintln!("end of game cleanups: {}", e.0);
    }
}
