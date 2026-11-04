//! A game between two AIs, recorded as the arena server records its games (`altered_ai::record`),
//! so that `positions list/add` can take positions from it.
//!   cargo run --release -p altered-imitate --example record_game -- AI_A AI_B SEED OUT_DIR [off]
//! AI: `deck:DXX` or `imitation:STEM` (each plays its own deck). `off`: without the filter of the
//! plays that do nothing (to find such plays).
use altered_ai::legal;
use altered_ai::play::{new_game, Agent, Observation};
use altered_ai::record::{self, Event, Record};
use altered_ai::search::{Ai, Params};
use altered_ai::useful;
use altered_imitate::agent::{Imitator, PlayerFile, Shared};
use rand::SeedableRng;
use rand_chacha::ChaCha8Rng;
use serde_json::{json, Value};

const IMITATION: &str = "private/tournament-617607/imitation";

fn read<T: serde::de::DeserializeOwned>(path: &str) -> T {
    serde_json::from_str(&std::fs::read_to_string(path).unwrap_or_else(|e| panic!("{}: {}", path, e))).unwrap()
}

/// The deck id and a new agent of an AI
fn ai(id: &str) -> (String, Box<dyn Agent>) {
    let params = |d: &str| -> Params { read(&format!("ai/params/{}.json", d)) };
    if let Some(stem) = id.strip_prefix("imitation:") {
        let p: PlayerFile = read(&format!("{}/players/{}.json", IMITATION, stem));
        let shared: Shared = read(&format!("{}/shared.json", IMITATION));
        return (p.deck.clone(), Box::new(Imitator::new(&p.label, &shared, Some(&p), Some(params(&p.deck)))));
    }
    let d = id.strip_prefix("deck:").expect("AI: deck:DXX or imitation:STEM");
    (d.to_string(), Box::new(Ai::new(id, params(d))))
}

fn main() {
    std::thread::Builder::new().stack_size(512 << 20).spawn(run).unwrap().join().unwrap();
}

fn run() {
    let a: Vec<String> = std::env::args().collect();
    let seed: u64 = a[3].parse().unwrap();
    if a.get(5).map(String::as_str) == Some("off") {
        useful::DISABLED.store(true, std::sync::atomic::Ordering::Relaxed);
    }
    let decks: Value = read("server/goldens/tournament_decks.json");
    let (d0, a0) = ai(&a[1]);
    let (d1, a1) = ai(&a[2]);
    let mut agents = [a0, a1];
    let pair = [decks[&d0].clone(), decks[&d1].clone()];
    let mut g = new_game(&pair, seed).unwrap();
    let mut rec = Record::start(&g);
    let mut rng = ChaCha8Rng::seed_from_u64(seed);
    for _ in 0..5000 {
        if g.is_over() {
            break;
        }
        let Some(&p) = g.waiting_for().first() else { break };
        let seat = g.seat_order.iter().position(|x| *x == p as i64).unwrap_or(0);
        let Ok(Some(d)) = g.try_decision(p) else { break };
        let obs = Observation::new(&g, p as i64, &pair);
        let ans = agents[seat].decide(&obs, &d, &mut rng);
        // Refused: the first candidate the engine accepts, as the server does
        let mut done = false;
        for c in std::iter::once(ans).chain(legal::candidates(&d)) {
            let e = Event::Ai { pid: p, body: legal::with_id(&d, &c) };
            if record::apply(&mut g, &e).is_ok() {
                rec.events.push(e);
                done = true;
                break;
            }
        }
        if !done {
            eprintln!("no answer accepted: {}", d);
            break;
        }
    }
    let id = format!("rec{}", seed);
    let seats: Vec<Value> = g.seat_order.iter().zip([&a[1], &a[2]]).map(|(pid, ai)| json!({"id": pid, "name": ai, "bot": true, "ai": ai})).collect();
    let out = json!({"engine": "rules", "id": id, "seats": seats, "game": g, "record": rec});
    std::fs::create_dir_all(&a[4]).unwrap();
    let path = format!("{}/{}.json", a[4], id);
    std::fs::write(&path, serde_json::to_vec(&out).unwrap()).unwrap();
    println!("{}: {} events, {}", path, rec.events.len(), if g.is_over() { "game over" } else { "not over" });
}
