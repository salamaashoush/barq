"""Insert flush() before an assertion that follows a write or an effect creation.

Solid 2.0 publishes writes and runs effects at the next flush. Tests written for
immediate visibility need the flush spelled out. Only statement-level assertions
are touched: one nested deeper than the statement that dirtied the graph sits
inside a callback and is left alone.
"""
import re, sys

DIRTY = re.compile(r"(\.(set|update|mutate)\(|\b(effect|trackedEffect|reaction)\(|\bset(State|Store|Todos|Items|Base|View|User|Count|Value|Data|List|Rows)\w*\(|\brefresh\()")
CLEAN = re.compile(r"\b(flush|settle|settleStep)\(|\bawait\b")
TEST = re.compile(r"^\s*(test|it)(\.\w+)?\(")
ASSERT = re.compile(r"^\s*(expect\(|assert)")

def indent(line):
    return len(line) - len(line.lstrip(" "))

def run(path):
    src = open(path).read()
    lines = src.split("\n")
    out = []
    pending = None
    inserted = 0
    for line in lines:
        if TEST.match(line):
            pending = None
        if ASSERT.match(line) and pending is not None and indent(line) <= pending:
            out.append(" " * indent(line) + "flush();")
            inserted += 1
            pending = None
        if CLEAN.search(line):
            pending = None
        elif DIRTY.search(line) and not ASSERT.match(line):
            here = indent(line)
            pending = here if pending is None else min(pending, here)
        out.append(line)
    if inserted == 0:
        return 0
    text = "\n".join(out)
    if not re.search(r"\bflush\b[^(]", src.split("describe(")[0]) and not re.search(r"import[^;]*\bflush\b[^;]*from", src):
        m = re.search(r"import\s*\{([^}]*)\}\s*from\s*\"(\./index\.ts|\./signals\.ts|@barqjs/core)\";", text)
        if m:
            names = m.group(1)
            sep = ",\n  " if "\n" in names else ", "
            text = text[:m.start(1)] + names.rstrip().rstrip(",") + sep + "flush" + ("\n" if "\n" in names else " ") + text[m.end(1):]
        else:
            print("  ! no import to extend:", path)
    open(path, "w").write(text)
    return inserted

total = 0
for p in sys.argv[1:]:
    n = run(p)
    total += n
    if n: print(f"{n:4d} {p}")
print("total", total)
