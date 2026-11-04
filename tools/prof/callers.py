"""Samples of the frames matching REGEX, by their nearest engine or AI caller (generic clone and
memo helpers skipped).
  python3 tools/prof/callers.py FILE REGEX [TOP]"""
import re, sys
from collections import defaultdict
lines = open(sys.argv[1]).read().split("\n")
rx = re.compile(sys.argv[2]); top = int(sys.argv[3]) if len(sys.argv) > 3 else 25
start = next(i for i, l in enumerate(lines) if l.startswith("Call graph:"))
end = next(i for i, l in enumerate(lines) if l.startswith("Total number in stack"))
pat = re.compile(r"^([\s+!:|]*)(\d+)\s+(.*?)\s+\(in ([^)]*)\)")
def simple(n):
    if not n.startswith("_R"): return n
    ids = re.findall(r"\d+([A-Za-z_][A-Za-z0-9_]*)", n)
    ids = [i for i in ids if not re.match(r"^Cs[A-Za-z0-9]+_\d*", i)]
    return "::".join(ids[-3:])
res = defaultdict(int); stack = []
for l in lines[start+1:end]:
    m = pat.match(l)
    if not m: continue
    d, c, n = len(m.group(1)), int(m.group(2)), m.group(3)
    while stack and stack[-1][0] >= d: stack.pop()
    if rx.search(n) and not any(rx.search(x[2]) for x in stack):
        # nearest caller in altered_rules / altered_ai that is not a generic helper
        for sd, sn, raw in reversed(stack):
            if ("altered_rules" in raw or "altered_ai" in raw) and not re.search(r"clone|Clone|drop_glue|to_vec|eval_run|memo_bool", raw):
                res[sn] += c; break
    stack.append((d, simple(n), n))
for k, v in sorted(res.items(), key=lambda kv: -kv[1])[:top]: print("%6d  %s" % (v, k))
