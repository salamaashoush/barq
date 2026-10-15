"""Insert flush() after a statement-level effect(...) creation.

The old engine ran an effect's first pass inside the call; Solid 2.0 runs it at
the next flush. A test that creates an effect and then acts on its first pass
needs that flush spelled out where the first pass used to happen.
"""
import re, sys

START = re.compile(r"^(\s*)(?:const \w+ = |let \w+ = |\w+ = |return )?(?:effect|trackedEffect)\(")
def run(path):
    lines = open(path).read().split("\n")
    out = []; n = 0; i = 0
    while i < len(lines):
        line = lines[i]; out.append(line)
        m = START.match(line)
        if m and not line.lstrip().startswith("return"):
            ind = m.group(1)
            end = i
            if not line.rstrip().endswith(");"):
                j = i + 1
                while j < len(lines) and not (lines[j].startswith(ind) and lines[j][len(ind):].startswith((")", "}")) and lines[j].rstrip().endswith(");")):
                    j += 1
                if j >= len(lines):
                    i += 1; continue
                out.extend(lines[i+1:j+1]); end = j
            nxt = lines[end+1] if end + 1 < len(lines) else ""
            if "flush(" not in nxt:
                out.append(ind + "flush();"); n += 1
            i = end + 1; continue
        i += 1
    if n: open(path, "w").write("\n".join(out))
    return n
tot = 0
for p in sys.argv[1:]:
    k = run(p); tot += k
    if k: print(f"{k:4d} {p}")
print("total", tot)
