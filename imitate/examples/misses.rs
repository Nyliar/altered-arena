//! Sorts the held-out misses of a cross-validation run: misses PREDS NATIVE_DIR [OUT]
//!
//! For each missed decision, the model's answer is looked for among the same player's next
//! recorded answers (`Trace::given_later`): given later the same day, on a later day, or not in
//! the window. Order-only misses (`Trace::reordered`) are labelled right since the labels count
//! them, so they only show here for predictions made with older labels.
use altered_ai::legal;
use altered_imitate::{cv, dataset};
use serde_json::{json, Value};
use std::collections::BTreeMap;

fn main() {
    std::thread::Builder::new().stack_size(512 << 20).spawn(run).unwrap().join().unwrap();
}

fn run() {
    let args: Vec<String> = std::env::args().collect();
    let preds: Vec<Value> = serde_json::from_str(&std::fs::read_to_string(&args[1]).unwrap()).unwrap();
    let mut by_table: BTreeMap<i64, Vec<&Value>> = BTreeMap::new();
    for p in preds.iter().filter(|p| p["top1"] == false) {
        by_table.entry(p["table"].as_i64().unwrap()).or_default().push(p);
    }
    let tables: Vec<(i64, Vec<&Value>)> = by_table.into_iter().collect();
    let threads = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(8);
    let rows = cv::par_map(&tables, threads, |(t, ps)| {
        let n = dataset::read_replay(&format!("{}/{}.replay.json", args[2], t)).unwrap();
        let tr = dataset::trace(n).unwrap();
        let day = |i: usize| tr.before[i].oracle_state()["day"].as_i64().unwrap_or(0);
        ps.iter()
            .map(|p| {
                let k = p["step"].as_u64().unwrap() as usize;
                let pred = legal::candidates(&tr.decs[k])[p["best"].as_u64().unwrap() as usize].clone();
                let later = tr.given_later(k, &pred);
                let cat = match later {
                    None => "not given in the window",
                    Some(_) if tr.reordered(k, &pred) => "order only, same result",
                    Some(j) if day(j) == day(k) => "given later the same day",
                    Some(_) => "given on a later day",
                };
                let ex = json!({"table": t, "step": k, "later": later, "prompt": p["prompt"], "real": tr.n.steps[k].a, "pred": pred});
                (p["group"].as_str().unwrap_or("").to_string(), cat.to_string(), ex)
            })
            .collect::<Vec<_>>()
    });
    let mut out: BTreeMap<String, BTreeMap<String, usize>> = BTreeMap::new();
    let mut examples = vec![];
    for (g, cat, ex) in rows.into_iter().flatten() {
        *out.entry(g.clone()).or_default().entry(cat.clone()).or_default() += 1;
        *out.entry("ALL".into()).or_default().entry(cat.clone()).or_default() += 1;
        examples.push(json!({"group": g, "cat": cat, "ex": ex}));
    }
    println!("{}", serde_json::to_string_pretty(&out).unwrap());
    std::fs::write(args.get(3).cloned().unwrap_or("misses.json".into()), serde_json::to_string_pretty(&examples).unwrap()).unwrap();
}
