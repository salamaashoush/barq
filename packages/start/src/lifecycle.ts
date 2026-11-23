import type { ServerPlugin } from "srvx";

/**
 * Response headers by path: `"/pyodide/**"` for everything under a
 * directory, `"/files/*"` for one level, an exact path otherwise.
 */
export type HeaderRules = Readonly<Record<string, Readonly<Record<string, string>>>>;

function pattern(path: string): RegExp {
  const source = path
    .split(/(\*\*|\*)/)
    .map((part) =>
      part === "**" ? ".*" : part === "*" ? "[^/]*" : part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"),
    )
    .join("");
  return new RegExp(`^${source}$`);
}

/** The headers every rule matching `pathname` sets, later rules winning a name. */
export function headersFor(rules: HeaderRules): (pathname: string) => [string, string][] {
  const compiled = Object.entries(rules).map(([path, headers]) => ({
    test: pattern(path),
    headers: Object.entries(headers),
  }));
  return (pathname) => {
    const out = new Map<string, string>();
    for (const rule of compiled) {
      if (rule.test.test(pathname)) for (const [name, value] of rule.headers) out.set(name, value);
    }
    return [...out];
  };
}

/**
 * Set the rules' headers on whatever answers a path: a static file, a page, a
 * server function or an API route. First in the chain, so the asset
 * middleware's answers carry them too.
 */
export function headerMiddleware(
  rules: HeaderRules,
): (request: Request, next: () => Response | Promise<Response>) => Promise<Response> {
  const find = headersFor(rules);
  return async (request, next) => {
    const response = await next();
    const headers = find(new URL(request.url).pathname);
    if (headers.length === 0) return response;
    let target = response;
    try {
      for (const [name, value] of headers) target.headers.set(name, value);
    } catch {
      // A `Response.redirect()` or a fetched response has immutable headers.
      target = new Response(response.body, response);
      for (const [name, value] of headers) target.headers.set(name, value);
    }
    return target;
  };
}

/** What a setup module is handed when the server starts. */
export interface ServerSetupContext {
  /** Run when the server shuts down, after it stops taking requests. */
  onClose(fn: () => void | Promise<void>): void;
}

/**
 * Code that runs once when the server starts, before it takes a request: a
 * check that the environment is usable, a timer for a scheduled job, a
 * connection pool to warm. Listed under `server.setup` in the barq Vite
 * plugin; the dev server runs it too, and prerendering does not.
 *
 * ```ts
 * export default defineServerSetup(({ onClose }) => {
 *   const timer = setInterval(runDailyRoundIfDue, 60 * 60 * 1000);
 *   onClose(() => clearInterval(timer));
 * });
 * ```
 */
export type ServerSetup = (context: ServerSetupContext) => void | Promise<void>;

export function defineServerSetup(setup: ServerSetup): ServerSetup {
  return setup;
}

/** Run each setup in order, and answer what closing has to run. */
export async function runSetups(setups: readonly ServerSetup[]): Promise<() => Promise<void>> {
  const closers: (() => void | Promise<void>)[] = [];
  for (const setup of setups) await setup({ onClose: (fn) => void closers.push(fn) });
  return async () => {
    for (const close of closers.splice(0).toReversed()) await close();
  };
}

/** A srvx plugin that runs `close` once the server has closed. */
export function closingPlugin(close: () => Promise<void>): ServerPlugin {
  return (server) => {
    const original = server.close.bind(server);
    server.close = async (closeActive) => {
      await original(closeActive);
      await close();
    };
  };
}
