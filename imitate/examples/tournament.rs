//! Round robin between AIs, each with its own deck: N games per pair (seats alternate), then the
//! standings by wins. An AI is `deck:DXX` (deck AI, ai/params) or `imitation:STEM` (imitation AI,
//! private/tournament-617607/imitation/players/STEM.json).
//!   cargo run --release -p altered-imitate --example tournament -- N AI AI [AI...]
use altered_ai::play::{play_game, run_parallel, Agent};
use altered_ai::search::{Ai, Params};
use altered_imitate::agent::{Imitator, PlayerFile, Shared};
use serde_json::Value;
use std::collections::BTreeMap;

const OUT: &str = "private/tournament-617607/imitation";

fn main() {
    std::thread::Builder::new().stack_size(512 << 20).spawn(run).unwrap().join().unwrap();
}

fn read<T: serde::de::DeserializeOwned>(path: &str) -> T {
    serde_json::from_str(&std::fs::read_to_string(path).unwrap_or_else(|e| panic!("{}: {}", path, e))).unwrap()
}

/// The deck, the display name and a new agent of an AI
fn ai(id: &str, shared: &Shared) -> (String, String, Box<dyn Agent>) {
    let params = |d: &str| -> Params { read(&format!("ai/params/{}.json", d)) };
    if let Some(stem) = id.strip_prefix("imitation:") {
        let p: PlayerFile = read(&format!("{}/players/{}.json", OUT, stem));
        let agent = Imitator::new(&p.label, shared, Some(&p), Some(params(&p.deck)));
        return (p.deck.clone(), p.label.clone(), Box::new(agent));
    }
    let deck = id.strip_prefix("deck:").unwrap_or_else(|| panic!("unknown AI {}", id));
    (deck.to_string(), format!("Deck AI {}", deck), Box::new(Ai::new(id, params(deck))))
}

fn run() {
    let a: Vec<String> = std::env::args().collect();
    let n: u64 = a[1].parse().unwrap();
    let ids = &a[2..];
    let decks: Value = read("server/goldens/tournament_decks.json");
    let shared: Shared = read(&format!("{}/shared.json", OUT));
    let threads = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(8);
    // Jobs: (first AI, second AI, seed); the first AI sits in seat 0 on odd seeds
    let mut jobs = vec![];
    for i in 0..ids.len() {
        for j in i + 1..ids.len() {
            for seed in 1..=n {
                jobs.push((i, j, seed));
            }
        }
    }
    let results = run_parallel(
        &jobs,
        threads,
        |&(i, j, seed)| {
            let (x, y) = if seed % 2 == 1 { (i, j) } else { (j, i) };
            let (dx, _, ax) = ai(&ids[x], &shared);
            let (dy, _, ay) = ai(&ids[y], &shared);
            let r = play_game(&[decks[&dx].clone(), decks[&dy].clone()], &mut [ax, ay], seed);
            if let Some(e) = &r.error {
                eprintln!("{} vs {} seed {}: {}", ids[x], ids[y], seed, e);
            }
            r.winner.map(|w| if w == 0 { x } else { y })
        },
        |&(i, j, seed), e| {
            eprintln!("{} vs {} seed {} panicked: {}", ids[i], ids[j], seed, e);
            None
        },
    );
    // wins[i][j]: games i won against j
    let mut wins = vec![vec![0u32; ids.len()]; ids.len()];
    let mut draws = vec![0u32; ids.len()];
    for (&(i, j, _), w) in jobs.iter().zip(&results) {
        match *w {
            Some(k) => wins[k][if k == i { j } else { i }] += 1,
            None => {
                draws[i] += 1;
                draws[j] += 1;
            }
        }
    }
    let names: Vec<String> = ids.iter().map(|id| ai(id, &shared).1).collect();
    let short: Vec<String> = (1..=ids.len()).map(|k| format!("#{}", k)).collect();
    let mut order: Vec<usize> = (0..ids.len()).collect();
    let total = |i: usize| wins[i].iter().sum::<u32>();
    order.sort_by_key(|&i| std::cmp::Reverse(total(i)));
    println!("| Rank | AI | Deck | Wins | Losses | Draws/errors | Win % |");
    println!("| --- | --- | --- | --- | --- | --- | --- |");
    let games = n as u32 * (ids.len() as u32 - 1);
    let mut rank_of = BTreeMap::new();
    for (r, &i) in order.iter().enumerate() {
        rank_of.insert(i, r);
        let w = total(i);
        let l: u32 = (0..ids.len()).map(|j| wins[j][i]).sum();
        let deck = ai(&ids[i], &shared).0;
        println!("| {} | {} | {} | {} | {} | {} | {:.0} % |", r + 1, names[i], deck, w, l, draws[i], 100.0 * w as f64 / games as f64);
    }
    println!();
    println!("Wins of the row against the column ({} games per pair):", n);
    println!();
    println!("| | {} |", order.iter().map(|&i| short[rank_of[&i]].clone()).collect::<Vec<_>>().join(" | "));
    println!("|{}", " --- |".repeat(ids.len() + 1));
    for &i in &order {
        let cells: Vec<String> = order.iter().map(|&j| if i == j { "—".into() } else { wins[i][j].to_string() }).collect();
        println!("| {} {} | {} |", short[rank_of[&i]], names[i], cells.join(" | "));
    }
}
