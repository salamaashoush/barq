"""Wrap each test body in rooted(...)."""
import re, sys
OPEN = re.compile(r"^(\s*)(test|it)(\.\w+)?\((.*?),\s*(async )?\(\) => \{\s*$")
def run(path):
    lines = open(path).read().split("\n"); n = 0; i = 0
    while i < len(lines):
        m = OPEN.match(lines[i])
        if m and "rooted(" not in lines[i]:
            ind = m.group(1)
            j = i + 1
            while j < len(lines) and not (lines[j].startswith(ind + "}") and not lines[j].startswith(ind + " ")):
                j += 1
            if j < len(lines) and lines[j].rstrip() in (ind + "});",):
                lines[i] = f"{ind}{m.group(2)}{m.group(3) or ''}({m.group(4)}, rooted({m.group(5) or ''}() => {{"
                lines[j] = ind + "}));"
                n += 1
        i += 1
    if n:
        text = "\n".join(lines)
        if 'from "./test-root.ts"' not in text:
            k = text.index("\nimport ")
            text = text[:k] + '\nimport { rooted } from "./test-root.ts";' + text[k:]
        open(path, "w").write(text)
    return n
for p in sys.argv[1:]:
    print(run(p), p)
