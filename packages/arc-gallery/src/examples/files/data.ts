import { type ReplOutput, type VirtualFsTree, bracketsBalanced } from "@barqjs/arc";

export const WORKSPACE: VirtualFsTree = {
  src: {
    "main.calc": "let width = 12\nlet height = 7\nprint(width * height)\n",
    "rates.calc": "let base = 40\nlet rush = base * 1.5\nrush\n",
    lib: { "units.calc": "let inch = 2.54\nlet foot = inch * 12\n" },
  },
  tests: { "main.test.calc": "count(3)\n" },
  "README.md": "# Calculator\n\nEach file is a list of lines the REPL can run.\n",
};

const RED = "\u001b[31m";
const DIM = "\u001b[2m";
const RESET = "\u001b[0m";

type Token = number | string;

function tokens(text: string): Token[] {
  const out: Token[] = [];
  const pattern = /\s*(\d+(?:\.\d+)?|[A-Za-z_]\w*|\*\*|[-+*/%()=,])/y;
  let at = 0;
  while (at < text.length) {
    if (/^\s*$/.test(text.slice(at))) break;
    pattern.lastIndex = at;
    const match = pattern.exec(text);
    if (match === null) throw new Error(`unexpected "${text.slice(at).trim()[0] ?? ""}"`);
    const piece = match[1] as string;
    out.push(/^\d/.test(piece) ? Number(piece) : piece);
    at = pattern.lastIndex;
  }
  return out;
}

/** A calculator with `let`, `print`, `count` and `sleep`, enough to show a REPL working. */
export class Calculator {
  private readonly names = new Map<string, number>([["pi", Math.PI]]);

  async *run(source: string, signal: AbortSignal): AsyncGenerator<ReplOutput> {
    let pending = "";
    for (const line of source.split("\n")) {
      if (pending === "" && (line.trim() === "" || line.trim().startsWith("#"))) continue;
      pending = pending === "" ? line : `${pending} ${line}`;
      if (!bracketsBalanced(pending)) continue;
      yield* this.line(pending, signal);
      pending = "";
      if (signal.aborted) return;
    }
    if (pending !== "") yield* this.line(pending, signal);
  }

  private async *line(line: string, signal: AbortSignal): AsyncGenerator<ReplOutput> {
    const list = tokens(line);
    let at = 0;
    const names = this.names;
    function peek(): Token | undefined {
      return list[at];
    }
    function take(expected?: string): Token {
      const token = list[at++];
      if (token === undefined) throw new Error("the line ends too early");
      if (expected !== undefined && token !== expected) throw new Error(`expected "${expected}"`);
      return token;
    }
    function atom(): number {
      const token = take();
      if (typeof token === "number") return token;
      if (token === "(") {
        const value = sum();
        take(")");
        return value;
      }
      if (token === "-") return -atom();
      if (/^[A-Za-z_]/.test(token)) {
        const value = names.get(token);
        if (value === undefined) throw new Error(`${token} is not defined`);
        return value;
      }
      throw new Error(`unexpected "${token}"`);
    }
    function power(): number {
      const base = atom();
      if (peek() === "**") {
        take();
        return base ** power();
      }
      return base;
    }
    function product(): number {
      let value = power();
      while (peek() === "*" || peek() === "/" || peek() === "%") {
        const op = take();
        const right = power();
        value = op === "*" ? value * right : op === "/" ? value / right : value % right;
      }
      return value;
    }
    function sum(): number {
      let value = product();
      while (peek() === "+" || peek() === "-") {
        const op = take();
        const right = product();
        value = op === "+" ? value + right : value - right;
      }
      return value;
    }
    try {
      const head = peek();
      if (head === "let") {
        take();
        const name = take();
        take("=");
        const value = sum();
        names.set(String(name), value);
        yield { kind: "info", text: `${DIM}${String(name)} = ${String(value)}${RESET}` };
      } else if ((head === "print" || head === "count" || head === "sleep") && list[1] === "(") {
        take();
        take("(");
        const value = sum();
        take(")");
        if (head === "print") yield { kind: "stdout", text: `${String(value)}\n` };
        else if (head === "sleep") await wait(value, signal);
        else {
          for (let step = 1; step <= value && !signal.aborted; step++) {
            await wait(400, signal);
            yield { kind: "stdout", text: `tick ${String(step)}\n` };
          }
        }
      } else {
        const value = sum();
        yield { kind: "result", text: String(value) };
      }
      if (at < list.length) throw new Error(`unexpected "${String(list[at])}"`);
    } catch (error) {
      if (signal.aborted) return;
      const message = error instanceof Error ? error.message : String(error);
      yield { kind: "error", text: `${RED}error${RESET}: ${message}` };
    }
  }
}

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}
