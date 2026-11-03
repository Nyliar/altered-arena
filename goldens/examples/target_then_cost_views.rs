//! GameViews of a card that targets then reads the Base Cost of its target, played on its rich
//! board (a golden file), for the client's replay viewer (`?replay=/FILE.json`): the turn, the
//! choice of the target, then the result for the first target of Base Cost <= LIMIT and for the
//! first above it, one file each.
//!
//!   cargo run --release -p goldens --example target_then_cost_views -- GOLDEN.json LIMIT OUT_PREFIX

use altered_rules::models::card;
use altered_rules::Game;
use serde_json::{json, Value};

fn answer(g: &mut Game, mut a: Value) {
    a["decisionId"] = g.decision(2001).expect("decision")["id"].clone();
    g.answer(2001, &a).expect("answer");
}

fn view(g: &mut Game) -> Value {
    g.view(Some(2001), "proof").expect("view")
}

fn main() {
    std::thread::Builder::new()
        .stack_size(256 << 20)
        .spawn(|| {
            let args: Vec<String> = std::env::args().skip(1).collect();
            let data: Value = serde_json::from_slice(&std::fs::read(&args[0]).expect("golden")).unwrap();
            let limit: i64 = args[1].parse().unwrap();
            let mut g = Game::from_bga_tables(&data["db"], &[3, 1, 6, 4, 2, 5]).unwrap();
            let played = data["cardId"].as_i64().unwrap();
            let v0 = view(&mut g);
            let play = json!({"type": "play", "cardId": played, "destination": "spell"});
            answer(&mut g, play.clone());
            let v1 = view(&mut g);
            let targets: Vec<i64> = v1["decision"]["cardIds"].as_array().unwrap().iter().filter_map(Value::as_i64).collect();
            for (cheap, name) in [(true, "cheap"), (false, "expensive")] {
                let mut h = g.clone();
                let t = *targets
                    .iter()
                    .find(|t| {
                        let field = if card::has_token(&h, **t, "fleeting").unwrap() { "costReserve" } else { "costHand" };
                        let cost = card::get(&mut h.clone(), **t, field).unwrap().as_i64().unwrap();
                        (cost <= limit) == cheap
                    })
                    .expect("a target");
                let select = json!({"type": "select", "cardIds": [t]});
                answer(&mut h, select.clone());
                let v2 = view(&mut h);
                let out = json!({"views": [v0, v1, v2], "steps": [{"move": 1, "player": 2001, "answer": play}, {"move": 2, "player": 2001, "answer": select}]});
                std::fs::write(format!("{}-{}.json", args[2], name), serde_json::to_vec(&out).unwrap()).unwrap();
                println!("{}: target {}", name, t);
            }
        })
        .unwrap()
        .join()
        .unwrap();
}
