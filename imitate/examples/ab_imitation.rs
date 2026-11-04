//! An imitation AI against a variant of itself (same player, same deck, seats alternated): wins of
//! each side and CPU time per decision of each side.
//!   cargo run --release -p altered-imitate --example ab_imitation -- STEM N VARIANT
//! VARIANT: `share` (the deck AI's pick searched once per decision, `Imitator::share_search`)
use altered_ai::play::{play_game, run_parallel, Agent, Observation};
use altered_ai::search::Params;
use altered_imitate::agent::{Imitator, PlayerFile, Shared};
use rand_chacha::ChaCha8Rng;
use serde_json::Value;
use std::sync::{Arc, Mutex};

const OUT: &str = "private/tournament-617607/imitation";

/// CPU time of the decisions (seconds, decisions), measured per thread
struct Timed(Box<dyn Agent>, Arc<Mutex<(f64, usize)>>);
impl Agent for Timed {
    fn name(&self) -> String {
        self.0.name()
    }
    fn decide(&mut self, obs: &Observation, d: &Value, rng: &mut ChaCha8Rng) -> Value {
        let t = cpu();
        let a = self.0.decide(obs, d, rng);
        let mut c = self.1.lock().unwrap();
        c.0 += cpu() - t;
        c.1 += 1;
        a
    }
}

/// CPU time of the calling thread, in seconds
fn cpu() -> f64 {
    let mut ts = libc_timespec { tv_sec: 0, tv_nsec: 0 };
    unsafe { clock_gettime(16, &mut ts) }; // CLOCK_THREAD_CPUTIME_ID on macOS
    ts.tv_sec as f64 + ts.tv_nsec as f64 * 1e-9
}
#[repr(C)]
struct libc_timespec {
    tv_sec: i64,
    tv_nsec: i64,
}
extern "C" {
    fn clock_gettime(clk: i32, ts: *mut libc_timespec) -> i32;
}

fn read<T: serde::de::DeserializeOwned>(path: &str) -> T {
    serde_json::from_str(&std::fs::read_to_string(path).unwrap_or_else(|e| panic!("{}: {}", path, e))).unwrap()
}

fn main() {
    std::thread::Builder::new().stack_size(512 << 20).spawn(run).unwrap().join().unwrap();
}

fn run() {
    let a: Vec<String> = std::env::args().collect();
    let stem = &a[1];
    let n: u64 = a[2].parse().unwrap();
    let variant = a[3].clone();
    let decks: Value = read("server/goldens/tournament_decks.json");
    let shared: Shared = read(&format!("{}/shared.json", OUT));
    let p: PlayerFile = read(&format!("{}/players/{}.json", OUT, stem));
    let params: Params = read(&format!("ai/params/{}.json", p.deck));
    let deck = decks[&p.deck].clone();
    let (tv, tb) = (Arc::new(Mutex::new((0.0, 0))), Arc::new(Mutex::new((0.0, 0))));
    let seeds: Vec<u64> = (1..=n).collect();
    let threads = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(8);
    let wins = run_parallel(
        &seeds,
        threads,
        |&seed| {
            let mut v = Imitator::new(&format!("{} {}", p.label, variant), &shared, Some(&p), Some(params.clone()));
            match variant.as_str() {
                "share" => v.share_search = true,
                x => panic!("unknown variant {}", x),
            }
            let b = Imitator::new(&p.label, &shared, Some(&p), Some(params.clone()));
            let v: Box<dyn Agent> = Box::new(Timed(Box::new(v), tv.clone()));
            let b: Box<dyn Agent> = Box::new(Timed(Box::new(b), tb.clone()));
            // The variant sits first on odd seeds
            let variant_seat = if seed % 2 == 1 { 0 } else { 1 };
            let mut agents: [Box<dyn Agent>; 2] = if variant_seat == 0 { [v, b] } else { [b, v] };
            let r = play_game(&[deck.clone(), deck.clone()], &mut agents, seed);
            if let Some(e) = &r.error {
                eprintln!("seed {}: {}", seed, e);
            }
            r.winner.map(|w| w == variant_seat)
        },
        |&seed, e| {
            eprintln!("seed {} panicked: {}", seed, e);
            None
        },
    );
    let vw = wins.iter().filter(|w| **w == Some(true)).count();
    let bw = wins.iter().filter(|w| **w == Some(false)).count();
    let (v, b) = (*tv.lock().unwrap(), *tb.lock().unwrap());
    let decided = (vw + bw).max(1) as f64;
    let pr = vw as f64 / decided;
    let ci = 1.96 * (pr * (1.0 - pr) / decided).sqrt();
    println!(
        "{} {} vs base: {} - {} ({:.0} % [{:.0}, {:.0}], {} undecided); CPU per decision: variant {:.1} ms, base {:.1} ms ({:.2}x)",
        p.label,
        variant,
        vw,
        bw,
        100.0 * pr,
        100.0 * (pr - ci),
        100.0 * (pr + ci),
        wins.len() - vw - bw,
        1000.0 * v.0 / v.1.max(1) as f64,
        1000.0 * b.0 / b.1.max(1) as f64,
        (v.0 / v.1.max(1) as f64) / (b.0 / b.1.max(1) as f64)
    );
}
