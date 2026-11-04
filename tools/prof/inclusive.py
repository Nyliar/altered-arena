"""Inclusive samples per function in a macOS `sample` call graph (a recursive function counts once
per stack), as a share of the worker thread's samples.
  python3 tools/prof/inclusive.py FILE [TOP] [REGEX]"""
import re, sys
from collections import defaultdict

path = sys.argv[1]
top = int(sys.argv[2]) if len(sys.argv) > 2 else 60
filt = sys.argv[3] if len(sys.argv) > 3 else None
lines = open(path).read().split("\n")
start = next(i for i, l in enumerate(lines) if l.startswith("Call graph:"))
end = next(i for i, l in enumerate(lines) if l.startswith("Total number in stack"))
pat = re.compile(r"^([\s+!:|]*)(\d+)\s+(.*?)\s+\(in ([^)]*)\)")
nodes = []
for l in lines[start + 1:end]:
    m = pat.match(l)
    if not m:
        continue
    depth = len(m.group(1))
    nodes.append((depth, int(m.group(2)), m.group(3), m.group(4)))

# simplify Rust v0 mangled names: keep the readable identifiers
def simple(n):
    if not n.startswith("_R"):
        return n
    ids = re.findall(r"\d+([A-Za-z_][A-Za-z0-9_]*)", n)
    ids = [i for i in ids if not re.match(r"^Cs[A-Za-z0-9]+_\d*", i)]
    return "::".join(ids[-4:])

incl = defaultdict(int)
stack = []  # (depth, name)
total = 0
for depth, count, name, lib in nodes:
    while stack and stack[-1][0] >= depth:
        stack.pop()
    s = simple(name)
    if s not in [x[1] for x in stack]:
        incl[s] += count
    stack.append((depth, s))
    if len(stack) == 1:
        total += count
work = incl.get("thread_start", 0) or total
items = sorted(incl.items(), key=lambda kv: -kv[1])
if filt:
    items = [kv for kv in items if re.search(filt, kv[0])]
for n, c in items[:top]:
    print("%7d %5.1f%%  %s" % (c, 100 * c / work, n[:150]))
