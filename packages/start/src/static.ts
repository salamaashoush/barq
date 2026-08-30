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
}

export interface StaticOptions {
  /** The client output directory. Default `dist/client`. */
  readonly dir?: string;
  /**
   * The manifest. Read from `<dir>/barq-assets.json` when omitted.
   *
   * Passing one is how a runtime with no filesystem serves a build it embedded
   * at deploy time, and how a test avoids writing files.
   */
  readonly manifest?: AssetManifest;
  /** Seconds. Applied to hashed assets; a prerendered page never gets it. */
  readonly maxAge?: number;
  /** Adds `immutable` beside `maxAge`. Only meaningful for hashed filenames. */
  readonly immutable?: boolean;
}

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
    const { pathname } = new loaded.url(request.url);

    const page = loaded.manifest.pages[pathname];
    if (page !== undefined) return loaded.servePage(page);

    // The miss, which is every SSR request: one `Set.has` and out, with no
    // syscall behind it. This is the whole point of the manifest.
    if (!loaded.files.has(pathname)) return next();

    return loaded.serveFile(request, next);
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
  readonly servePage: (page: PrerenderedAsset) => Promise<Response>;
  readonly serveFile: ServerMiddleware;
}

async function load(options: StaticOptions): Promise<Ready | null> {
  const dir = options.dir ?? "dist/client";
  const [{ readFile }, { staticMiddleware }, { FastURL }] = await Promise.all([
    import("node:fs/promises"),
    import("srvx/static"),
    import("srvx"),
  ]);

  const path = await import("node:path");

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

  const serveFile = staticMiddleware({
    dir,
    maxAge: options.maxAge,
    immutable: options.immutable,
  });

  return {
    manifest,
    files: new Set(manifest.files),
    url: FastURL as unknown as PathOnly,
    /**
     * A prerendered page, with the STATUS and HEADERS it was rendered as.
     *
     * Read directly rather than through `staticMiddleware`, which has no way to
     * answer anything but 200 — and a prerendered 404 served as 200 is the bug
     * this metadata exists to fix.
     */
    servePage: async (page) => {
      const body = await readFile(path.join(dir, page.file));
      const headers = new Headers(page.headers);
      if (!headers.has("content-type")) headers.set("content-type", "text/html; charset=utf-8");
      return new Response(body, { status: page.status, headers });
    },
    serveFile,
  };
}
