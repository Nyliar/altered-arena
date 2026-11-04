"""Samples under the frames matching REGEX, by their direct callee (self time as `<self>`).
  python3 tools/prof/children.py FILE REGEX [TOP]"""
import re, sys
from collections import defaultdict
lines = open(sys.argv[1]).read().split("\n")
rx = re.compile(sys.argv[2]); top = int(sys.argv[3]) if len(sys.argv) > 3 else 20
start = next(i for i, l in enumerate(lines) if l.startswith("Call graph:"))
end = next(i for i, l in enumerate(lines) if l.startswith("Total number in stack"))
pat = re.compile(r"^([\s+!:|]*)(\d+)\s+(.*?)\s+\(in ([^)]*)\)")
def simple(n):
    if not n.startswith("_R"): return n
    ids = re.findall(r"\d+([A-Za-z_][A-Za-z0-9_]*)", n)
    ids = [i for i in ids if not re.match(r"^Cs[A-Za-z0-9]+_\d*", i)]
    return "::".join(ids[-3:])
nodes = []
for l in lines[start+1:end]:
    m = pat.match(l)
    if m: nodes.append((len(m.group(1)), int(m.group(2)), m.group(3)))
res = defaultdict(int); total = 0
for i, (d, c, n) in enumerate(nodes):
    if not rx.search(n): continue
    # skip if an ancestor also matches (count the outermost only): walk back
    anc = False; dd = d
    for j in range(i - 1, -1, -1):
        if nodes[j][0] < dd:
            dd = nodes[j][0]
            if rx.search(nodes[j][2]): anc = True; break
    if anc: continue
    total += c; kids = 0
    for j in range(i + 1, len(nodes)):
        if nodes[j][0] <= d: break
        if nodes[j][0] == min(x[0] for x in nodes[i+1:j+1]):
            pass
    # direct children: next nodes with depth == first child depth
    j = i + 1
    if j < len(nodes) and nodes[j][0] > d:
        cd = nodes[j][0]
        while j < len(nodes) and nodes[j][0] > d:
            if nodes[j][0] == cd:
                res[simple(nodes[j][2])] += nodes[j][1]; kids += nodes[j][1]
            j += 1
    res["<self>"] += c - kids
print("total", total)
for k, v in sorted(res.items(), key=lambda kv: -kv[1])[:top]: print("%6d %5.1f%%  %s" % (v, 100 * v / max(total, 1), k[:140]))
