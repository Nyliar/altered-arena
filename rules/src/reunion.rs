//! Altered Reunion decks: a deck of decks-api (`GET /api/bga/decks/{id}`) as the publisher API
//! answers BGA's `get_player_deck_content`, the input of `actGetDeckInfos`
//! (`arena::NewPlayer::reunion_deck`). Not a translation: on BGA, altered-bga-api sits between the
//! game and decks-api and its conversion is not public. It is rebuilt from what the game reads
//! (States/SetupTrait.php actGetDeckInfos: `legality`, `hero`, `cards` keyed by reference with
//! `quantity`, and `content` for a Unique) and from the API decks the BGA replays show (`deckName`,
//! `id`, `faction`, `cardCount`, `apiId`; the hero is not in `cards`).

use serde_json::{json, Map, Value};

/// `/_U_\d+$/`: the reference of a Unique
fn is_unique_ref(r: &str) -> bool {
    r.rfind("_U_").is_some_and(|i| {
        let n = &r[i + 3..];
        !n.is_empty() && n.bytes().all(|b| b.is_ascii_digit())
    })
}

/// The deck of decks-api (`/api/bga/decks/{id}`: name, id, faction, deckLegality, alterator,
/// cardQuantity, deckCardsByType) as the publisher API answers `get_player_deck_content`
pub fn publisher_response(deck: &Value) -> Result<Value, String> {
    let hero = deck["alterator"]["reference"].as_str().ok_or("deck without hero")?;
    let mut cards = Map::new();
    let groups = deck["deckCardsByType"].as_object().ok_or("deck without cards")?;
    for (kind, group) in groups {
        // The hero is the deck's `hero`, not one of its cards
        if kind == "hero" {
            continue;
        }
        for entry in group["deckUserListCard"].as_array().into_iter().flatten() {
            let Some(reference) = entry["card"]["reference"].as_str() else { continue };
            let mut line = json!({"quantity": entry["quantity"]});
            if is_unique_ref(reference) {
                line["content"] = entry["card"].clone();
            }
            cards.insert(reference.to_string(), line);
        }
    }
    let id = deck["id"].as_str().unwrap_or("");
    Ok(json!({
        "deckName": deck["name"],
        "id": id,
        "faction": deck["faction"]["reference"],
        "legality": deck["deckLegality"]["resume"]["globalValidity"] == json!(true),
        "hero": hero,
        "cardCount": deck["cardQuantity"],
        "cards": cards,
        "apiId": id,
    }))
}
