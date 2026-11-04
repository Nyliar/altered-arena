//! Position tests: a position of a real game where a player must decide, and what a good answer
//! is (or is not). The AIs are asked the decision and checked against the expectation, so that
//! a known mistake (a card played for nothing, a wasted effect) stays fixed and a change of an AI
//! can be measured on the positions that matter.
//!
//! A position file (`ai/positions/NAME.json`) holds the whole game at the decision, so that it
//! does not depend on how the game was reached; `source` says where it was taken from.
//!
//! Expectations are written with card names, not card ids: `{"type": "play", "card": "Sticky
//! Note Seals"}` matches playing any copy of that card. `avoid`: the AI must give none of these
//! answers; `prefer`: it must give one of them.

use crate::legal;
use altered_rules::Game;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

/// An answer, by what it does: its type (`play`, `endTurn`, `tap`, `support`, `select`, `pass`...)
/// and, when given, the card it names, the cards it selects (any order) or the destination
#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq)]
pub struct Pattern {
    #[serde(rename = "type")]
    pub kind: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub card: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cards: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub destination: Option<String>,
}

impl Pattern {
    /// `TYPE`, `TYPE:CARD`, `select:CARD|CARD...`, with `@DESTINATION` at the end for a play
    /// (`play:Kelon Elemental@heroExpedition`)
    pub fn parse(s: &str) -> Pattern {
        let (s, destination) = match s.rsplit_once('@') {
            Some((a, d)) => (a, Some(d.to_string())),
            None => (s, None),
        };
        let (kind, rest) = match s.split_once(':') {
            Some((k, r)) => (k.to_string(), Some(r)),
            None => (s.to_string(), None),
        };
        let (card, cards) = match rest {
            Some(r) if kind == "select" => (None, Some(r.split('|').map(String::from).collect())),
            Some(r) => (Some(r.to_string()), None),
            None => (None, None),
        };
        Pattern { kind, card, cards, destination }
    }

    pub fn matches(&self, g: &Game, a: &Value) -> bool {
        if a["type"] != self.kind.as_str() {
            return false;
        }
        if let Some(c) = &self.card {
            if card_name(g, &a["cardId"]) != *c {
                return false;
            }
        }
        if let Some(cs) = &self.cards {
            let mut want = cs.clone();
            let mut got: Vec<String> = a["cardIds"].as_array().into_iter().flatten().map(|id| card_name(g, id)).collect();
            want.sort();
            got.sort();
            if want != got {
                return false;
            }
        }
        if let Some(d) = &self.destination {
            if a["destination"] != d.as_str() {
                return false;
            }
        }
        true
    }
}

impl std::fmt::Display for Pattern {
    fn fmt(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
        write!(f, "{}", self.kind)?;
        if let Some(c) = &self.card {
            write!(f, ":{}", c)?;
        }
        if let Some(cs) = &self.cards {
            write!(f, ":{}", cs.join("|"))?;
        }
        if let Some(d) = &self.destination {
            write!(f, "@{}", d)?;
        }
        Ok(())
    }
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct Expect {
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub avoid: Vec<Pattern>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub prefer: Vec<Pattern>,
}

impl Expect {
    pub fn check(&self, g: &Game, a: &Value) -> bool {
        !self.avoid.iter().any(|p| p.matches(g, a)) && (self.prefer.is_empty() || self.prefer.iter().any(|p| p.matches(g, a)))
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Position {
    pub name: String,
    /// What the position shows, in words
    pub note: String,
    /// Where it was taken from (`{"game": ID, "event": N}` for a game of the arena server)
    pub source: Value,
    /// The player who decides
    pub seat: u32,
    /// The AI that played this seat, when it was one (`deck:DXX`, `imitation:STEM`)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ai: Option<String>,
    /// The answer given in the game
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub played: Option<Value>,
    pub expect: Expect,
    pub game: Game,
}

impl Position {
    pub fn load(path: &str) -> Result<Position, String> {
        let text = std::fs::read_to_string(path).map_err(|e| format!("{}: {}", path, e))?;
        serde_json::from_str(&text).map_err(|e| format!("{}: {}", path, e))
    }

    pub fn save(&self, path: &str) -> Result<(), String> {
        let mut g = self.clone();
        g.game.compact();
        std::fs::write(path, serde_json::to_vec(&g).map_err(|e| e.to_string())?).map_err(|e| format!("{}: {}", path, e))
    }

    /// The decision of the seat in this position
    pub fn decision(&self) -> Result<Value, String> {
        self.game.try_decision(self.seat).map_err(|e| e.0)?.ok_or_else(|| format!("{}: player {} has no decision to take", self.name, self.seat))
    }
}

/// The name of a card (empty when the id is not a card)
pub fn card_name(g: &Game, id: &Value) -> String {
    id.as_i64().and_then(|i| g.cards.get(&i)).and_then(|c| c.props.get("name")).and_then(|n| n.as_str()).unwrap_or("").to_string()
}

/// An answer in words, with card names: `play Sticky Note Seals @spell`, `select [Gibil, Kappa]`
pub fn describe(g: &Game, a: &Value) -> String {
    let mut s = a["type"].as_str().unwrap_or("?").to_string();
    if a.get("cardId").is_some() {
        s += &format!(" {}", card_name(g, &a["cardId"]));
    }
    if let Some(ids) = a["cardIds"].as_array() {
        s += &format!(" [{}]", ids.iter().map(|id| card_name(g, id)).collect::<Vec<_>>().join(", "));
    }
    for k in ["destination", "choice", "expedition", "key", "value"] {
        if let Some(v) = a.get(k) {
            s += &format!(" @{}", v.as_str().map(String::from).unwrap_or_else(|| v.to_string()));
        }
    }
    s
}

/// The candidates of `d` in words, for a listing
pub fn describe_candidates(g: &Game, d: &Value) -> Vec<String> {
    legal::candidates(d).iter().map(|a| describe(g, a)).collect()
}

/// A short header of the position: day, phase, the player's Mana and hand
pub fn header(g: &Game, seat: u32) -> String {
    let mut g = g.clone();
    let day = altered_rules::core::globals::get_int(&mut g, "day").unwrap_or(0);
    let phase = altered_rules::core::globals::get_int(&mut g, "phase").unwrap_or(0);
    let v = g.view(Some(seat), "").unwrap_or(Value::Null);
    let me = v["players"].as_array().into_iter().flatten().find(|p| p["id"] == json!(seat)).cloned().unwrap_or(Value::Null);
    format!("day {} phase {}, Mana {}/{}, hand {}", day, phase, me["manaAvailable"], me["manaTotal"], me["handCount"])
}
