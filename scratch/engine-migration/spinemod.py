"""Rewrite `const X = enterRoot(); ...; exit(X);` and `const X = enter(P); ...; exit(X);`
to run the statements between under the scope with runWithOwner.

Only the plain form is rewritten: same indentation, and no declaration between
the two that a later line could need. Anything else is reported for a hand edit.
"""
import re, sys
OPEN = re.compile(r"^(\s*)const (\w+) = (enterRoot|enter)\(([^)]*)\);\s*$")
def run(path):
    lines = open(path).read().split("\n"); out = []; i = 0; done = 0; manual = []
    while i < len(lines):
        m = OPEN.match(lines[i])
        if not m:
            out.append(lines[i]); i += 1; continue
        ind, name, fn, args = m.groups()
        j = i + 1
        while j < len(lines) and lines[j].rstrip() != f"{ind}exit({name});":
            if lines[j].strip() and len(lines[j]) - len(lines[j].lstrip()) < len(ind): j = len(lines); break
            j += 1
        between = lines[i+1:j] if j < len(lines) else None
        if between is None or any(re.match(rf"^{ind}(const|let|var) ", b) for b in between):
            manual.append(i + 1); out.append(lines[i]); i += 1; continue
        make = "rootScope()" if fn == "enterRoot" else f"childScope({args.split(',')[0].strip()})"
        out.append(f"{ind}const {name} = {make};")
        out.append(f"{ind}runWithOwner({name}, () => {{")
        out.extend(("  " + b) if b.strip() else b for b in between)
        out.append(f"{ind}}});")
        i = j + 1; done += 1
    text = "\n".join(out)
    open(path, "w").write(text)
    print(path, "rewritten", done, "manual at lines", manual)
for p in sys.argv[1:]: run(p)
