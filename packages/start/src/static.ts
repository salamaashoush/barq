/**
 * Serving the build's own files, with the lookup the BUILD already knows.
 *
 * A production request is overwhelmingly a MISS: an SSR page asks this layer
 * about a path that is not a file, and every static server that answers by
 * touching the filesystem pays two syscalls to say "no". Measured on this
 * machine against `packages/kitchen-sink/preview.mjs`, which is the shape barq
 * had (`scratch/nitro/static.mjs`):
 *
 *     MISS   existsSync + statSync   1.3295 us     build-time map   0.8080 us
 *     HIT    existsSync + statSync   1.1544 us     build-time map   0.7986 us
 *
 * So the manifest is a NEGATIVE index first and foremost. On a miss nothing
 * touches the disk; on a hit the work is handed to `srvx/static`, which already
 * does compression, precompressed variants, `ETag`, `Last-Modified`, ranges,
 * dotfile rules and symlink containment in 798 lines that barq should not
 * reimplement.
 *
 * WHAT THE MANIFEST CARRIES AND WHY. Not `type`, `size` or `etag`: those are
 * derivable from the file and a copy of them is a second source of truth that
 * goes stale against the bytes. What it carries is exactly the two things the
 * filesystem cannot answer — which request paths exist, and what STATUS and
 * HEADERS a prerendered page was rendered with. That second one was being
 * dropped: `PrerenderedPage` has recorded `status` and `headers` all along, and
 * nothing persisted them, so a prerendered 404 page was served as 200.
 */

import type { ServerMiddleware, ServerRequest } from "srvx";

/** Where the build writes it, inside the client output directory. */
export const ASSET_MANIFEST_FILE = "barq-assets.json";

/** A page the prerenderer wrote, and the response it was rendered as. */
export interface PrerenderedAsset {
  /** Relative to the client output directory. */
  readonly file: string;
  readonly status: number;
  readonly headers?: Readonly<Record<string, string>>;
}

export interface AssetManifest {
  /** Request path -> the prerendered page written for it. */
  readonly pages: Readonly<Record<string, PrerenderedAsset>>;
  /** Every other servable path, as request paths. */
  readonly files: readonly string[];
  /**
   * The members of `files` whose NAME changes when their bytes do.
   *
   * The build knows and a directory listing cannot say: a chunk it emitted is
   * `app-8f1c2a.js`, and `robots.txt` copied out of `public/` sits beside it
   * under a name the next deploy reuses. Only the first may be cached without
   * asking again.
   */
  readonly hashed?: readonly string[];
  /**
   * What every request path here starts with and no file on disk does: Vite's
   * `base`, without its trailing slash. Absent for a site served from `/`.
   */
  readonly base?: string;
}

export interface StaticOptions {
  /**
   * The client output directory. Default `dist/client`.
   *
   * A `file:` URL is read as one, which is how an entry names a directory beside
   * itself: `new URL("../client", import.meta.url)`. Its `.pathname` is not a
   * path, since a space in it is still `%20`.
   */
  readonly dir?: string | URL;
  /**
   * The manifest. Read from `<dir>/barq-assets.json` when omitted.
   *
   * Passing one is how a runtime with no filesystem serves a build it embedded
   * at deploy time, and how a test avoids writing files.
   */
  readonly manifest?: AssetManifest;
  /**
   * Seconds a hashed asset may be reused without asking. One year when the
   * manifest says which names are hashed, which a build's does.
   *
   * A file under a stable name is answered with a validator and no lifetime, so
   * a browser asks again and is told 304. A prerendered page keeps the
   * `cache-control` it was rendered with and is never given this one.
   *
   * A manifest that does not carry `hashed` cannot tell the two apart, so the
   * lifetime applies to every file it lists and there is none by default.
   */
  readonly maxAge?: number;
  /**
   * Adds `immutable` beside `maxAge`. On when the manifest says which names
   * are hashed, since for those it is true by construction.
   */
  readonly immutable?: boolean;
}

/** A hashed name never changes its bytes, so a year is the conventional forever. */
const HASHED_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * Headers that describe the bytes on the wire rather than the page.
 *
 * `srvx/static` computes them for the response it actually sends: compressed
 * or not, whole or a 304. The ones a page was RENDERED with describe an
 * uncompressed body in a build's memory.
 */
const REPRESENTATION = new Set([
  "accept-ranges",
  "content-encoding",
  "content-length",
  "content-range",
  "etag",
  "last-modified",
]);

/**
 * Just enough of `URL` to find the path.
 *
 * `FastURL` is srvx's own, and it falls back to `new URL` for anything a
 * verbatim parse would get wrong: dot segments, backslashes, control
 * characters, non-ASCII. Using it rather than `new URL` is most of what makes
 * the miss path cheap, since the lookups either side of it are a `Set.has` and
 * a property read.
 */
type PathOnly = new (url: string) => { readonly pathname: string };

/**
 * Serve `dist/client` for the paths the build says are there.
 *
 * Returns a `srvx` middleware, so it composes with anything else a project
 * passes in `ServerOptions.middleware` and runs before the page handler.
 *
 * INITIALISATION IS LAZY AND HAPPENS ONCE. `node:fs` and `srvx/static` are
 * imported inside it rather than at module scope, because `@barqjs/start/serve`
 * resolves on workerd too and neither exists there. After the first request the
 * fast path is synchronous — the `await` is not paid per request.
 */
export function assetMiddleware(options: StaticOptions = {}): ServerMiddleware {
  let ready: Ready | null | undefined;
  let loading: Promise<void> | undefined;

  // `loaded` is a PARAMETER rather than the captured `ready`, because a closure
  // variable cannot be narrowed across the two call sites and the alternative is
  // a non-null assertion on every line of the hot path.
  const answer = (
    loaded: Ready | null,
    request: ServerRequest,
    next: () => Response | Promise<Response>,
  ): Response | Promise<Response> => {
    if (loaded === null) return next();
    // A file is a file to GET and HEAD alone. A prerendered path may also be a
    // route with a `POST` handler: the page is its GET, and every other method
    // is the application's to answer.
    if (request.method !== "GET" && request.method !== "HEAD") return next();

    // The manifest holds NAMES, as the build read them off the disk, and a
    // request holds a URL: `release notes.txt` arrives as `release%20notes.txt`.
    // `decodeURI` because it is what `srvx/static` opens the file by, so the two
    // cannot disagree about which name a path means.
    let { pathname } = new loaded.url(request.url);
    if (pathname.includes("%")) {
      try {
        pathname = decodeURI(pathname);
      } catch {
        return next();
      }
    }

    const page = loaded.manifest.pages[pathname];
    if (page !== undefined) return loaded.servePage(page, request);

    // The miss, which is every SSR request: one `Set.has` and out, with no
    // syscall behind it. This is the whole point of the manifest.
    if (!loaded.files.has(pathname)) return next();

    return loaded.serveFile(pathname, request, next);
  };

  return (request, next) => {
    if (ready !== undefined) return answer(ready, request, next);
    loading ??= load(options).then((loaded) => {
      ready = loaded;
    });
    return loading.then(() => answer(ready ?? null, request, next));
  };
}

interface Ready {
  readonly manifest: AssetManifest;
  readonly files: ReadonlySet<string>;
  readonly url: PathOnly;
  readonly servePage: (page: PrerenderedAsset, request: ServerRequest) => Promise<Response>;
  readonly serveFile: (
    pathname: string,
    request: ServerRequest,
    next: () => Response | Promise<Response>,
  ) => Response | Promise<Response>;
}

/**
 * The request `srvx/static` would have been sent for this FILE.
 *
 * It finds a file by the request's path, and two things here are found by the
 * manifest instead: a page, whose path is `/about` and whose file is
 * `about/index.html`, and anything under a `base`, which is in every request
 * path and in no file name. `encodeURI` because `decodeURI` is what it opens
 * the file by.
 */
function requestFor(file: string, request: ServerRequest): ServerRequest {
  return new Request(`http://asset/${encodeURI(file)}`, {
    method: request.method,
    headers: request.headers,
  });
}

async function load(options: StaticOptions): Promise<Ready | null> {
  const [{ readFile }, { staticMiddleware }, { FastURL }, path, { fileURLToPath }] =
    await Promise.all([
      import("node:fs/promises"),
      import("srvx/static"),
      import("srvx"),
      import("node:path"),
      import("node:url"),
    ]);

  const dir =
    options.dir instanceof URL ? fileURLToPath(options.dir) : (options.dir ?? "dist/client");

  let manifest = options.manifest;
  if (manifest === undefined) {
    try {
      manifest = JSON.parse(
        await readFile(path.join(dir, ASSET_MANIFEST_FILE), "utf8"),
      ) as AssetManifest;
    } catch {
      // No manifest means no build to serve, which is a legitimate deployment:
      // a server that only answers server functions has no client directory at
      // all. Serving nothing beats guessing at the filesystem.
      return null;
    }
  }

  const hashed = manifest.hashed === undefined ? null : new Set(manifest.hashed);
  const revalidated = staticMiddleware({ dir });
  const lifetime = hashed === null ? options.maxAge : (options.maxAge ?? HASHED_MAX_AGE);
  const longLived =
    lifetime === undefined
      ? revalidated
      : staticMiddleware({
          dir,
          maxAge: lifetime,
          immutable: options.immutable ?? hashed !== null,
        });
  const prefix = manifest.base ?? "";

  /** The page's bytes with nothing negotiated, for what `srvx/static` will not answer. */
  const whole = async (page: PrerenderedAsset): Promise<Response> => {
    const body = await readFile(path.join(dir, page.file));
    const headers = new Headers(page.headers);
    if (!headers.has("content-type")) headers.set("content-type", "text/html; charset=utf-8");
    return new Response(body, { status: page.status, headers });
  };
  const declined = (): Response => new Response(null, { status: 404 });

  return {
    manifest,
    files: new Set(manifest.files),
    url: FastURL as unknown as PathOnly,
    /**
     * A prerendered page, with the STATUS and HEADERS it was rendered as.
     *
     * A 200 goes through `staticMiddleware` under its file's name, so it gets
     * the validator, the 304 and the encoding a hashed chunk gets. Anything
     * else is read directly: `staticMiddleware` has no way to answer but 200,
     * and a conditional request must not turn a 404 page into a 304.
     */
    servePage: async (page, request) => {
      if (page.status !== 200) return whole(page);
      let found = true;
      const served = await revalidated(requestFor(page.file, request), () => {
        found = false;
        return declined();
      });
      if (!found) return whole(page);
      for (const name in page.headers) {
        const value = page.headers[name];
        if (value === undefined) continue;
        const key = name.toLowerCase();
        if (REPRESENTATION.has(key)) continue;
        // Both are right: the page varies on what it said, and the bytes on
        // the encoding that was negotiated for them.
        if (key === "vary") served.headers.append(key, value);
        else served.headers.set(key, value);
      }
      return served;
    },
    serveFile: (pathname, request, next) => {
      const serve = hashed === null || hashed.has(pathname) ? longLived : revalidated;
      return prefix === ""
        ? serve(request, next)
        : serve(requestFor(pathname.slice(prefix.length + 1), request), next);
    },
  };
}
