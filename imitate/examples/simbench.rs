//! Speed of the AIs' simulations, on one thread, fixed games: time per game and per decision, and a
//! checksum of the games (winner, day, answers of each seat) that must not change when only the
//! speed does.
//!   cargo run --release -p altered-imitate --example simbench -- MODE GAMES
//! MODE: `bot` (simple bot both seats), `deck` (deck AI D06 vs deck AI D01), `imitation` (the
//! imitation AI of BZH - Dodouce, D06, vs deck AI D01)
use altered_ai::play::{play_game, Agent, SimpleBot};
use altered_ai::search::{Ai, Params};
use altered_imitate::agent::{Imitator, PlayerFile, Shared};
use serde_json::Value;
use std::hash::{Hash, Hasher};
use std::time::Instant;

const OUT: &str = "private/tournament-617607/imitation";

fn read<T: serde::de::DeserializeOwned>(path: &str) -> T {
    serde_json::from_str(&std::fs::read_to_string(path).unwrap_or_else(|e| panic!("{}: {}", path, e))).unwrap()
}

fn main() {
    std::thread::Builder::new().stack_size(512 << 20).spawn(run).unwrap().join().unwrap();
}

fn run() {
    let a: Vec<String> = std::env::args().collect();
    let mode = a.get(1).map(String::as_str).unwrap_or("deck");
    let games: u64 = a.get(2).and_then(|s| s.parse().ok()).unwrap_or(4);
    let decks: Value = read("server/goldens/tournament_decks.json");
    let params = |d: &str| -> Params { read(&format!("ai/params/{}.json", d)) };
    let mut hash = std::collections::hash_map::DefaultHasher::new();
    let (mut decisions, mut ms) = (0usize, 0f64);
    let t = Instant::now();
    for seed in 1..=games {
        let mut agents: [Box<dyn Agent>; 2] = match mode {
            "bot" => [Box::new(SimpleBot), Box::new(SimpleBot)],
            "deck" => [Box::new(Ai::new("a", params("D06"))), Box::new(Ai::new("b", params("D01")))],
            "imitation" => {
                let shared: Shared = read(&format!("{}/shared.json", OUT));
                let p: PlayerFile = read(&format!("{}/players/BZH___Dodouce___Treyst___Rossum.json", OUT));
                [Box::new(Imitator::new(&p.label, &shared, Some(&p), Some(params("D06")))), Box::new(Ai::new("b", params("D01")))]
            }
            m => panic!("unknown mode {}", m),
        };
        let r = play_game(&[decks["D06"].clone(), decks["D01"].clone()], &mut agents, seed);
        if let Some(e) = &r.error {
            eprintln!("seed {}: {}", seed, e);
        }
        (r.winner, r.day, r.decisions, r.refused).hash(&mut hash);
        decisions += r.decisions[0] + r.decisions[1];
        ms += r.millis as f64;
    }
    let s = t.elapsed().as_secs_f64();
    println!(
        "{} {} games: {:.2} s/game, {:.2} ms/decision ({} decisions), checksum {:016x}",
        mode,
        games,
        s / games as f64,
        1000.0 * s / decisions.max(1) as f64,
        decisions,
        hash.finish()
    );
    let _ = ms;
}
