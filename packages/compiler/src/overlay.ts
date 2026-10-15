/**
 * The development overlay: one place for what the compiler said about a module,
 * what the runtime reported while the page ran, and what was thrown and not
 * caught.
 *
 * It is a pill in a corner until something needs attention. Only an error opens
 * it by itself; a warning raises the count and waits to be asked. Every entry
 * carries the source it is about, and a click on its location opens that line
 * in the editor.
 */

/** A line of source around a diagnostic, as the server cut it. */
export interface OverlayFrame {
  /** The number of the first line in `lines`. */
  first: number;
  lines: string[];
}

export interface OverlayDiagnostic {
  code?: string;
  severity: "note" | "warning" | "error";
  message: string;
  file: string;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
  docs?: string;
  frame?: OverlayFrame;
}

export interface OverlayPayload {
  overlay: boolean | "warning" | "error";
  diagnostics: OverlayDiagnostic[];
}

/** A place in a file, as a frame of a server stack or the JSX a finding is about. */
export interface OverlayLocation {
  file: string;
  line: number;
  column: number;
  name?: string;
  /** A frame in a dependency rather than in the project, shown dimmed. */
  library: boolean;
}

/**
 * Something the SERVER reported while serving a page or a call: an error a
 * stream contained, a server function that failed, a header written too late.
 * The dev server has already mapped its stack to source and cut the frame.
 */
export interface OverlayServerEntry {
  code?: string;
  severity: "note" | "warning" | "error";
  message: string;
  docs?: string;
  ownerPath?: string[];
  at?: OverlayLocation;
  frame?: OverlayFrame;
  stack?: OverlayLocation[];
}

interface OverlayHot {
  on(event: string, listener: (data: never) => void): void;
  send(event: string): void;
}

/** A finding on the runtime's channel: the engine's and barq's, one shape. */
export interface OverlayRuntimeEvent {
  code: string;
  severity: "info" | "warn" | "error";
  message: string;
  docs?: string;
  ownerPath?: string[];
  data?: Record<string, unknown>;
}

interface RuntimeChannel {
  subscribe(listener: (event: OverlayRuntimeEvent) => void): () => void;
}

export interface OverlayConfig {
  event: string;
  ready: string;
  /** What the server reported, one entry per message. */
  server: string;
  /** Sent when the developer clears the runtime entries, so the server forgets them too. */
  clear: string;
  /** The project root, so a module URL can be turned back into a file. */
  root: string;
}

/**
 * Mount the overlay. Serialised with `toString()` into the page, so it names
 * nothing outside itself.
 */
export function mountOverlay(
  hot: OverlayHot | undefined,
  runtime: RuntimeChannel | undefined,
  config: OverlayConfig,
): { element: HTMLElement; dispose(): void } {
  type Severity = "note" | "warning" | "error";
  interface Location {
    file: string;
    line: number;
    column: number;
    name?: string;
    library: boolean;
  }
  interface Entry {
    key: string;
    origin: "compile" | "runtime" | "server";
    severity: Severity;
    code?: string;
    message: string;
    docs?: string;
    ownerPath?: string[];
    at?: Location;
    endLine?: number;
    endColumn?: number;
    frame?: { first: number; lines: string[] };
    stack?: Location[];
    count: number;
  }

  const RANK: Record<Severity, number> = { note: 0, warning: 1, error: 2 };
  const LEVEL: Record<OverlayRuntimeEvent["severity"], Severity> = {
    info: "note",
    warn: "warning",
    error: "error",
  };
  const NOUN: Record<Severity, string> = { note: "note", warning: "warning", error: "error" };
  const STORE = "barq:overlay:filter";

  let compiled: Entry[] = [];
  let thrown: Entry[] = [];
  let threshold = 2;
  let open = false;
  let filter: Severity | "all" = "all";
  const seen = new Set<string>();
  try {
    const kept = sessionStorage.getItem(STORE);
    if (kept === "note" || kept === "warning" || kept === "error") filter = kept;
  } catch {
    // Storage can be refused outright; the filter then lasts for the page.
  }

  const host = document.createElement("div");
  host.id = "barq-diagnostics";
  const root = host.attachShadow({ mode: "open" });

  const make = <K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className: string,
    text?: string,
  ): HTMLElementTagNameMap[K] => {
    const node = document.createElement(tag);
    if (className !== "") node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  const style = make("style", "");
  style.textContent = `
:host { all: initial; --bg: #ffffff; --fg: #1b1f27; --dim: #667085; --line: #e4e7ec;
  --soft: #f6f7f9; --error: #d92d20; --warning: #b54708; --note: #3b5bdb; --mark: #fff1c2;
  --shadow: 0 12px 40px rgba(16, 24, 40, .18), 0 2px 6px rgba(16, 24, 40, .08); }
@media (prefers-color-scheme: dark) {
  :host { --bg: #15171c; --fg: #e6e8ec; --dim: #98a2b3; --line: #2a2e37; --soft: #1c1f26;
    --error: #f97066; --warning: #fdb022; --note: #84a5ff; --mark: #4a3b10;
    --shadow: 0 12px 40px rgba(0, 0, 0, .55), 0 2px 6px rgba(0, 0, 0, .4); } }
* { box-sizing: border-box; }
.pill, .panel { position: fixed; right: 16px; bottom: 16px; z-index: 2147483646;
  font: 13px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; color: var(--fg); }
.pill { all: unset; position: fixed; right: 16px; bottom: 16px; z-index: 2147483646;
  display: inline-flex; align-items: center; gap: 8px; padding: 7px 12px; border-radius: 999px;
  background: var(--bg); color: var(--fg); border: 1px solid var(--line); box-shadow: var(--shadow);
  font: 600 12px/1 system-ui, -apple-system, "Segoe UI", sans-serif; cursor: pointer; }
.pill:focus-visible, button:focus-visible, a:focus-visible { outline: 2px solid var(--note); outline-offset: 2px; }
.dot { width: 8px; height: 8px; border-radius: 50%; flex: none; }
.panel { display: flex; flex-direction: column; width: min(760px, calc(100vw - 32px));
  max-height: min(72vh, 720px); background: var(--bg); border: 1px solid var(--line);
  border-radius: 12px; box-shadow: var(--shadow); overflow: hidden; }
.head { display: flex; align-items: center; gap: 6px; padding: 10px 12px; border-bottom: 1px solid var(--line); }
.title { font-weight: 700; margin-right: 6px; }
.grow { flex: 1; }
button { all: unset; cursor: pointer; }
.chip { padding: 4px 9px; border-radius: 999px; border: 1px solid var(--line); color: var(--dim);
  font-size: 12px; font-weight: 600; }
.chip[aria-pressed="true"] { background: var(--fg); color: var(--bg); border-color: var(--fg); }
.tool { padding: 4px 8px; border-radius: 6px; color: var(--dim); font-size: 12px; font-weight: 600; }
.tool:hover, .chip:hover { color: var(--fg); }
.chip[aria-pressed="true"]:hover { color: var(--bg); }
.list { overflow: auto; overscroll-behavior: contain; }
.entry { padding: 12px 14px 14px; border-bottom: 1px solid var(--line); border-left: 3px solid var(--tone); }
.entry:last-child { border-bottom: 0; }
.meta { display: flex; flex-wrap: wrap; align-items: baseline; gap: 8px; margin-bottom: 4px; font-size: 12px; }
.kind { color: var(--tone); font-weight: 700; text-transform: uppercase; letter-spacing: .04em; font-size: 11px; }
.code { color: var(--dim); font: 600 12px ui-monospace, SFMono-Regular, Menlo, monospace; text-decoration: none; }
a.code:hover { color: var(--fg); text-decoration: underline; }
.times { color: var(--dim); }
.where { color: var(--dim); font: 12px ui-monospace, SFMono-Regular, Menlo, monospace; border-radius: 4px; }
.where:hover { color: var(--fg); text-decoration: underline; }
.message { white-space: pre-wrap; overflow-wrap: anywhere; font-weight: 500; }
.owners { margin-top: 4px; color: var(--dim); font: 12px ui-monospace, SFMono-Regular, Menlo, monospace; }
.origin { color: var(--dim); font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; }
.message code { font: 12px ui-monospace, SFMono-Regular, Menlo, monospace; background: var(--soft);
  border: 1px solid var(--line); border-radius: 4px; padding: 0 4px; }
.frame { margin: 10px 0 0; padding: 8px 0; background: var(--soft); border: 1px solid var(--line);
  border-radius: 8px; overflow: auto; font: 12px/1.6 ui-monospace, SFMono-Regular, Menlo, monospace; }
.row { display: flex; white-space: pre; padding: 0 12px 0 0; }
.row.hit { background: var(--mark); }
.gutter { flex: none; width: 4ch; margin: 0 12px 0 8px; text-align: right; color: var(--dim); user-select: none; }
.caret { color: var(--tone); font-weight: 700; }
.stack { margin: 10px 0 0; padding: 0; list-style: none; display: grid; gap: 2px;
  font: 12px ui-monospace, SFMono-Regular, Menlo, monospace; }
.stack .library { opacity: .55; }
.empty { padding: 28px 14px; color: var(--dim); text-align: center; }
.live { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
`;

  const pill = make("button", "pill");
  pill.type = "button";
  const panel = make("section", "panel");
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "barq diagnostics");
  panel.tabIndex = -1;
  const live = make("div", "live");
  live.setAttribute("aria-live", "polite");
  root.append(style, pill, panel, live);

  const all = (): Entry[] =>
    [...thrown, ...compiled].toSorted((a, b) => RANK[b.severity] - RANK[a.severity]);

  const count = (entries: Entry[], severity: Severity): number =>
    entries.filter((entry) => entry.severity === severity).length;

  const plural = (total: number, noun: string): string =>
    `${total} ${noun}${total === 1 ? "" : "s"}`;

  const summary = (entries: Entry[]): string =>
    (["error", "warning", "note"] as const)
      .map((severity) => [count(entries, severity), NOUN[severity]] as const)
      .filter(([total]) => total > 0)
      .map(([total, noun]) => plural(total, noun))
      .join(" · ");

  /** Text with its backticked spans set as code, which every message uses. */
  const prose = (text: string): HTMLElement => {
    const node = make("div", "message");
    text.split("`").forEach((part, index) => {
      if (part === "") return;
      node.append(index % 2 === 1 ? make("code", "", part) : document.createTextNode(part));
    });
    return node;
  };

  const short = (file: string): string =>
    file.startsWith(config.root) ? file.slice(config.root.length).replace(/^\//, "") : file;

  const edit = (at: Location): void => {
    const target = `${at.file}:${at.line}:${at.column}`;
    void fetch(`/__open-in-editor?file=${encodeURIComponent(target)}`).catch(() => undefined);
  };

  const whereButton = (at: Location): HTMLElement => {
    const label = `${short(at.file)}:${at.line}:${at.column}`;
    const button = make("button", "where", at.name ? `${at.name}  ${label}` : label);
    button.type = "button";
    button.title = "Open in editor";
    button.addEventListener("click", () => edit(at));
    return button;
  };

  const frameOf = (entry: Entry): HTMLElement | null => {
    const frame = entry.frame;
    const at = entry.at;
    if (frame === undefined || at === undefined) return null;
    const box = make("div", "frame");
    frame.lines.forEach((text, index) => {
      const number = frame.first + index;
      const row = make("div", number === at.line ? "row hit" : "row");
      row.append(make("span", "gutter", String(number)), document.createTextNode(text || " "));
      box.append(row);
      if (number !== at.line) return;
      const end =
        entry.endLine === at.line && entry.endColumn !== undefined && entry.endColumn > at.column
          ? entry.endColumn
          : at.column + 1;
      const under = make("div", "row");
      // One span: a flex row drops an item that is nothing but spaces, and the
      // carets then sit under the gutter instead of under what they point at.
      under.append(
        make("span", "gutter", ""),
        make(
          "span",
          "caret",
          " ".repeat(Math.max(0, at.column - 1)) + "^".repeat(Math.max(1, end - at.column)),
        ),
      );
      box.append(under);
    });
    return box;
  };

  const describe = (entry: Entry): string => {
    const head = [entry.code, entry.severity].filter(Boolean).join(" ");
    const owners = entry.ownerPath ? `\nin ${entry.ownerPath.join(" › ")}` : "";
    const where = entry.at ? `\n${entry.at.file}:${entry.at.line}:${entry.at.column}` : "";
    const docs = entry.docs ? `\n${entry.docs}` : "";
    return `${head}: ${entry.message}${owners}${where}${docs}`;
  };

  const entryNode = (entry: Entry): HTMLElement => {
    const node = make("article", "entry");
    node.style.setProperty("--tone", `var(--${entry.severity})`);
    const meta = make("div", "meta");
    meta.append(make("span", "kind", entry.severity));
    if (entry.origin === "server") meta.append(make("span", "origin", "server"));
    if (entry.code !== undefined) {
      if (entry.docs !== undefined) {
        const link = make("a", "code", entry.code);
        link.href = entry.docs;
        link.target = "_blank";
        link.rel = "noreferrer";
        link.title = "What this means and how to fix it";
        meta.append(link);
      } else {
        meta.append(make("span", "code", entry.code));
      }
    }
    if (entry.count > 1) meta.append(make("span", "times", `×${entry.count}`));
    if (entry.at !== undefined) meta.append(whereButton(entry.at));
    meta.append(make("span", "grow"));
    const copy = make("button", "tool", "Copy");
    copy.type = "button";
    copy.addEventListener("click", () => {
      void navigator.clipboard?.writeText(describe(entry)).then(() => {
        copy.textContent = "Copied";
      });
    });
    meta.append(copy);
    node.append(meta, prose(entry.message));
    if (entry.ownerPath !== undefined && entry.ownerPath.length > 0) {
      node.append(make("div", "owners", `in ${entry.ownerPath.join(" › ")}`));
    }
    const frame = frameOf(entry);
    if (frame !== null) node.append(frame);
    // One frame is the location already shown above it.
    if (entry.stack !== undefined && entry.stack.length > 1) {
      const list = make("ol", "stack");
      for (const at of entry.stack) {
        const item = make("li", at.library ? "library" : "");
        item.append(whereButton(at));
        list.append(item);
      }
      node.append(list);
    }
    return node;
  };

  const chip = (label: string, value: Severity | "all"): HTMLElement => {
    const button = make("button", "chip", label);
    button.type = "button";
    button.setAttribute("aria-pressed", String(filter === value));
    button.addEventListener("click", () => {
      filter = value;
      try {
        sessionStorage.setItem(STORE, value);
      } catch {
        // See above: the choice still holds for this page.
      }
      render();
    });
    return button;
  };

  const close = (): void => {
    open = false;
    render();
    pill.focus();
  };

  function render(): void {
    const entries = all();
    if (entries.length === 0) {
      host.remove();
      open = false;
      return;
    }
    if (!host.isConnected) document.body.append(host);
    const worst = entries[0]?.severity ?? "note";

    pill.hidden = open;
    pill.style.display = open ? "none" : "";
    pill.textContent = "";
    const dot = make("span", "dot");
    dot.style.background = `var(--${worst})`;
    pill.append(dot, document.createTextNode(summary(entries)));
    pill.setAttribute("aria-label", `barq diagnostics: ${summary(entries)}. Open.`);

    panel.hidden = !open;
    panel.style.display = open ? "" : "none";
    if (!open) return;
    panel.textContent = "";
    const head = make("header", "head");
    head.append(make("span", "title", "barq"), chip(`All ${entries.length}`, "all"));
    for (const severity of ["error", "warning", "note"] as const) {
      const total = count(entries, severity);
      if (total > 0) head.append(chip(`${plural(total, NOUN[severity])}`, severity));
    }
    head.append(make("span", "grow"));
    if (thrown.length > 0) {
      const clear = make("button", "tool", "Clear runtime");
      clear.type = "button";
      clear.addEventListener("click", () => {
        thrown = [];
        hot?.send(config.clear);
        render();
      });
      head.append(clear);
    }
    const shut = make("button", "tool", "Close");
    shut.type = "button";
    shut.setAttribute("aria-label", "Close diagnostics");
    shut.addEventListener("click", close);
    head.append(shut);

    const list = make("div", "list");
    const shown = filter === "all" ? entries : entries.filter((entry) => entry.severity === filter);
    if (shown.length === 0) list.append(make("div", "empty", `No ${filter}s.`));
    for (const entry of shown) list.append(entryNode(entry));
    panel.append(head, list);
  }

  /** Open by itself only for something at or above the threshold that was not there before. */
  const settle = (): void => {
    const entries = all();
    let fresh = false;
    for (const entry of entries) {
      if (RANK[entry.severity] < threshold || seen.has(entry.key)) continue;
      seen.add(entry.key);
      fresh = true;
    }
    if (fresh) {
      open = true;
      live.textContent = `barq: ${summary(entries)}`;
    }
    render();
  };

  // ── runtime: the source map turns a position in served code into a line ──

  interface Mapped {
    sources: string[];
    contents: (string | null)[];
    /** Per generated line: `[column, source, line, column]`, sorted by column. */
    lines: number[][][];
  }
  const maps = new Map<string, Promise<Mapped | null>>();
  const DIGITS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

  const decode = (mappings: string): number[][][] => {
    const lines: number[][][] = [];
    let source = 0;
    let line = 0;
    let column = 0;
    for (const text of mappings.split(";")) {
      const segments: number[][] = [];
      let generated = 0;
      for (const part of text.split(",")) {
        if (part === "") continue;
        const fields: number[] = [];
        let value = 0;
        let shift = 0;
        for (const char of part) {
          const digit = DIGITS.indexOf(char);
          value += (digit & 31) << shift;
          if ((digit & 32) !== 0) {
            shift += 5;
            continue;
          }
          fields.push((value & 1) === 1 ? -(value >>> 1) : value >>> 1);
          value = 0;
          shift = 0;
        }
        generated += fields[0] ?? 0;
        if (fields.length < 4) continue;
        source += fields[1] ?? 0;
        line += fields[2] ?? 0;
        column += fields[3] ?? 0;
        segments.push([generated, source, line, column]);
      }
      lines.push(segments);
    }
    return lines;
  };

  const mapOf = (url: string): Promise<Mapped | null> => {
    let known = maps.get(url);
    if (known === undefined) {
      known = fetch(url)
        .then((response) => response.text())
        .then((text) => {
          const marker = "//# sourceMappingURL=data:application/json;base64,";
          const at = text.lastIndexOf(marker);
          if (at === -1) return null;
          const encoded = text.slice(at + marker.length).split("\n", 1)[0] ?? "";
          const json = JSON.parse(
            new TextDecoder().decode(Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0))),
          ) as { sources?: string[]; sourcesContent?: (string | null)[]; mappings?: string };
          return {
            sources: json.sources ?? [],
            contents: json.sourcesContent ?? [],
            lines: decode(json.mappings ?? ""),
          };
        })
        .catch(() => null);
      maps.set(url, known);
    }
    return known;
  };

  const fileOf = (url: string): string => {
    const path = decodeURIComponent(new URL(url).pathname);
    if (path.startsWith("/@fs/")) return path.slice(4);
    return `${config.root}${path}`;
  };

  const locate = async (
    url: string,
    line: number,
    column: number,
    name: string | undefined,
  ): Promise<{ at: Location; content: string | null }> => {
    const file = fileOf(url);
    const library = file.includes("/node_modules/") || !file.startsWith(config.root);
    const plain = { at: { file, line, column, name, library }, content: null };
    const map = await mapOf(url);
    const segments = map?.lines[line - 1];
    if (map === null || segments === undefined) return plain;
    let found: number[] | undefined;
    for (const segment of segments) {
      if ((segment[0] ?? 0) > column - 1) break;
      found = segment;
    }
    found ??= segments[0];
    if (found === undefined) return plain;
    return {
      at: { file, line: (found[2] ?? 0) + 1, column: (found[3] ?? 0) + 1, name, library },
      content: map.contents[found[1] ?? 0] ?? null,
    };
  };

  const FRAME = /^\s*(?:at\s+)?(?:(.*?)\s*[(@])?((?:https?|file):\/\/.+?):(\d+):(\d+)\)?\s*$/;

  /** `file:line:column`, the form a development compile writes beside a template. */
  const place = (text: unknown): Location | undefined => {
    if (typeof text !== "string") return undefined;
    const match = /^(.*):(\d+):(\d+)$/.exec(text);
    if (match === null) return undefined;
    const file = match[1] ?? "";
    return {
      file,
      line: Number(match[2]),
      column: Number(match[3]),
      library: file.includes("/node_modules/") || !file.startsWith(config.root),
    };
  };

  const report = (
    severity: Severity,
    code: string | undefined,
    error: unknown,
    docs?: string,
    ownerPath?: string[],
    at?: Location,
  ): void => {
    const failure = error instanceof Error ? error : undefined;
    const message = failure ? `${failure.name}: ${failure.message}` : String(error);
    const key = `runtime:${code ?? ""}:${message}:${ownerPath?.join(">") ?? ""}`;
    const known = thrown.find((entry) => entry.key === key);
    if (known !== undefined) {
      known.count++;
      render();
      return;
    }
    const entry: Entry = {
      key,
      origin: "runtime",
      severity,
      code,
      message,
      docs,
      ownerPath,
      at,
      count: 1,
    };
    thrown.push(entry);
    settle();
    const frames = (failure?.stack ?? "")
      .split("\n")
      .map((text) => FRAME.exec(text))
      .filter((match): match is RegExpExecArray => match !== null)
      .slice(0, 12);
    if (frames.length === 0) return;
    void Promise.all(
      frames.map((match) =>
        locate(match[2] ?? "", Number(match[3]), Number(match[4]), match[1] || undefined),
      ),
    ).then((located) => {
      entry.stack = located.map((item) => item.at);
      const own = located.find((item) => !item.at.library) ?? located[0];
      if (own !== undefined) {
        entry.at = own.at;
        if (own.content !== null) {
          const lines = own.content.split("\n");
          const first = Math.max(1, own.at.line - 2);
          entry.frame = { first, lines: lines.slice(first - 1, own.at.line + 2) };
        }
      }
      render();
    });
  };

  const onError = (event: ErrorEvent): void =>
    report("error", undefined, event.error ?? event.message);
  const onRejection = (event: PromiseRejectionEvent): void =>
    report("error", undefined, event.reason);
  const onKey = (event: KeyboardEvent): void => {
    if (event.key === "Escape" && open) close();
  };
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
  root.addEventListener("keydown", onKey as EventListener);
  pill.addEventListener("click", () => {
    open = true;
    render();
    panel.focus();
  });

  const unsubscribe = runtime?.subscribe((event) => {
    report(
      LEVEL[event.severity] ?? "warning",
      event.code,
      event.message,
      event.docs,
      event.ownerPath,
      place(event.data?.template),
    );
  });

  hot?.on(config.server, (data: OverlayServerEntry) => {
    const key = `server:${data.code ?? ""}:${data.message}`;
    const known = thrown.find((entry) => entry.key === key);
    if (known !== undefined) {
      known.count++;
      render();
      return;
    }
    thrown.push({ key, origin: "server", ...data, count: 1 });
    settle();
  });

  hot?.on(config.event, (data: OverlayPayload) => {
    threshold = data.overlay === true ? 0 : data.overlay === "warning" ? 1 : 2;
    compiled = data.diagnostics.map((item) => ({
      key: `compile:${item.file}:${item.line}:${item.column}:${item.code ?? ""}`,
      origin: "compile",
      severity: item.severity,
      code: item.code,
      message: item.message,
      docs: item.docs,
      at: { file: item.file, line: item.line, column: item.column, library: false },
      endLine: item.endLine,
      endColumn: item.endColumn,
      frame: item.frame,
      count: 1,
    }));
    settle();
  });
  hot?.send(config.ready);

  return {
    element: host,
    dispose() {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
      unsubscribe?.();
      host.remove();
    },
  };
}

/** The lines around a position, for the overlay to show. */
export function frameAround(source: string, line: number, endLine: number = line): OverlayFrame {
  const lines = source.split("\n");
  const first = Math.max(1, line - 2);
  const last = Math.min(lines.length, Math.max(line, endLine) + 2);
  return { first, lines: lines.slice(first - 1, last).map((text) => text.replace(/\r$/, "")) };
}

/** The page module that mounts the overlay against the application's own runtime. */
export function overlayModule(config: OverlayConfig, moduleSource: string): string {
  return (
    `import { DEV } from ${JSON.stringify(moduleSource)};\n` +
    `(${mountOverlay.toString()})(import.meta.hot, DEV?.diagnostics, ${JSON.stringify(config)});\n`
  );
}
