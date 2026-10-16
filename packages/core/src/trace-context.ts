/**
 * Solid 2.0's trace context: the W3C `traceparent` / `tracestate` / `baggage`
 * half of the HTTP exchange, derived once per request and handed on, to the
 * browser on the response head and to downstream services by the code that
 * reads `getTraceContext()`.
 *
 * The browser is told only when something upstream is recording the trace: an
 * incoming `traceparent` whose sampled flag is set. A trace the runtime
 * originated, and an unsampled one (load balancers and meshes stamp `00-…-00`
 * on every request they forward), stay off the wire: there is no recorded
 * server span for a browser to attach to, and a parent with flags `00` makes a
 * parent-based browser sampler drop the page load it would otherwise record.
 */

/** The trace the current request belongs to. Read with `getTraceContext()`. */
export interface TraceContext {
  /** 32 lowercase hex: the whole trace. */
  readonly traceId: string;
  /** 16 lowercase hex: this request's span. */
  readonly spanId: string;
  /** The incoming parent span, when the request continued a trace. */
  readonly parentId?: string;
  /** The incoming sampled flag; `undefined` when the runtime originated the trace. */
  readonly sampled?: boolean;
  /** The incoming `tracestate`, verbatim. */
  readonly state?: string;
  /** The incoming `baggage`, verbatim. */
  readonly baggage?: string;
  /**
   * What the browser is handed, as `Server-Timing` entries and as `<meta>` tags
   * in a document's head, and what a server function forwards downstream:
   * `fetch(url, { headers: { traceparent: entries.traceparent } })`.
   */
  readonly entries: Readonly<Record<string, string>> & { readonly traceparent: string };
}

export interface TraceRecord {
  readonly context: TraceContext;
  /** Whether the browser is told. */
  readonly emit: boolean;
}

const TRACEPARENT = /^([0-9a-f]{2})-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})(-.*)?$/;
const ZERO_TRACE = "0".repeat(32);
const ZERO_SPAN = "0".repeat(16);

function parseTraceparent(
  value: string | null,
): { traceId: string; parentId: string; sampled: boolean } | undefined {
  if (value === null) return undefined;
  const match = TRACEPARENT.exec(value.trim());
  if (match === null) return undefined;
  const [, version, traceId = "", parentId = "", flags = "00", rest] = match;
  // `ff` is invalid; a later version may carry more fields and is read as 00,
  // which itself must end at the flags.
  if (version === "ff" || (version === "00" && rest !== undefined)) return undefined;
  if (traceId === ZERO_TRACE || parentId === ZERO_SPAN) return undefined;
  return { traceId, parentId, sampled: (Number.parseInt(flags, 16) & 1) === 1 };
}

function randomHex(bytes: number, zero: string): string {
  const buffer = new Uint8Array(bytes);
  let out = zero;
  while (out === zero) {
    crypto.getRandomValues(buffer);
    out = "";
    for (const byte of buffer) out += byte.toString(16).padStart(2, "0");
  }
  return out;
}

/**
 * Keyed by the request, so every read inside one request answers the same
 * object, and on the global under a registered symbol because the server
 * bundle and the host that serves it each carry a copy of this module: one
 * request with two records would have two span ids.
 */
const RECORDS = Symbol.for("barq.trace-records");

function records(): WeakMap<WeakKey, TraceRecord> {
  const holder = globalThis as { [RECORDS]?: WeakMap<WeakKey, TraceRecord> };
  holder[RECORDS] ??= new WeakMap();
  return holder[RECORDS];
}

/** The record for `key`, derived the first time it is asked for. */
export function traceFor(key: WeakKey, request: Request | undefined): TraceRecord {
  const store = records();
  const known = store.get(key);
  if (known !== undefined) return known;
  const headers = request?.headers;
  const incoming = parseTraceparent(headers?.get("traceparent") ?? null);
  const state = headers?.get("tracestate") ?? undefined;
  const baggage = headers?.get("baggage") ?? undefined;
  const traceId = incoming?.traceId ?? randomHex(16, ZERO_TRACE);
  const spanId = randomHex(8, ZERO_SPAN);
  const sampled = incoming?.sampled;
  const context: TraceContext = {
    traceId,
    spanId,
    ...(incoming === undefined ? {} : { parentId: incoming.parentId, sampled }),
    ...(state === undefined || state === "" ? {} : { state }),
    ...(baggage === undefined || baggage === "" ? {} : { baggage }),
    // The incoming `baggage` is upstream context and is not echoed to the page.
    entries: { traceparent: `00-${traceId}-${spanId}-${sampled === true ? "01" : "00"}` },
  };
  const record: TraceRecord = { context, emit: sampled === true };
  store.set(key, record);
  return record;
}

/** The record for a request event, keyed on its `request`. */
export function traceForEvent(event: { readonly request?: Request }): TraceRecord {
  return traceFor(event.request ?? event, event.request);
}

const TOKEN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

/** The entries of a `Server-Timing` list, split on the commas outside quoted strings. */
function splitServerTiming(value: string): string[] {
  const entries: string[] = [];
  let start = 0;
  let quoted = false;
  for (let at = 0; at < value.length; at++) {
    const char = value[at];
    if (quoted) {
      if (char === "\\") at++;
      else if (char === '"') quoted = false;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      entries.push(value.slice(start, at));
      start = at + 1;
    }
  }
  entries.push(value.slice(start));
  return entries;
}

function metricName(entry: string): string {
  return (entry.split(";")[0] ?? "").trim().toLowerCase();
}

function namesOn(headers: Headers): Set<string> {
  const names = new Set<string>();
  const existing = headers.get("server-timing");
  if (existing === null) return names;
  for (const entry of splitServerTiming(existing)) {
    const name = metricName(entry);
    if (name !== "") names.add(name);
  }
  return names;
}

/**
 * A quoted-string: a header value is a byte string, and `Headers.append`
 * throws on a code point above 0xFF.
 */
function quoteDesc(value: string): string {
  let out = "";
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f) continue;
    if (code > 0x7e) out += "?";
    else out += char === "\\" || char === '"' ? `\\${char}` : char;
  }
  return out;
}

/** The record's entries as `Server-Timing`, keeping any name the application already wrote. */
export function appendTraceServerTiming(headers: Headers, record: TraceRecord): void {
  if (!record.emit) return;
  const present = namesOn(headers);
  for (const [name, value] of Object.entries(record.context.entries)) {
    if (!TOKEN.test(name) || present.has(name.toLowerCase())) continue;
    headers.append("server-timing", `${name};desc="${quoteDesc(value)}"`);
    present.add(name.toLowerCase());
  }
}

/**
 * Fold one `Server-Timing` value onto `target` entry by entry, skipping names
 * `target` already carries: it is a list, so a stub's entries and a response's
 * own metrics stand side by side instead of one replacing the other.
 */
export function mergeServerTiming(target: Headers, value: string): void {
  const present = namesOn(target);
  for (const entry of splitServerTiming(value)) {
    const trimmed = entry.trim();
    const name = metricName(trimmed);
    if (name === "" || present.has(name)) continue;
    target.append("server-timing", trimmed);
  }
}

function escapeAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

/** The entries as `<meta name content>` for a document's head, or `""` when the browser is not told. */
export function traceMetaMarkup(record: TraceRecord): string {
  if (!record.emit) return "";
  let markup = "";
  for (const [name, value] of Object.entries(record.context.entries)) {
    if (TOKEN.test(name)) markup += `<meta name="${name}" content="${escapeAttribute(value)}">`;
  }
  return markup;
}
