/**
 * Rewriting the URLs of the assets the build emitted, at run time: TanStack
 * Start's `transformAssets`, for a CDN whose origin is known only once the
 * server starts or differs per request.
 *
 * What it reaches is what the page handler places itself: the entry script,
 * the matched chain's module preloads and stylesheets, a `lazy()` module's
 * chunks and stylesheets, and the early hints for all of them. A `head` link a
 * route writes is the route's own URL and is left alone.
 */

import type { AssetManifest, ModuleAssets } from "@barqjs/server";

export type AssetCrossOrigin = "" | "anonymous" | "use-credentials";

export type AssetKind = "script" | "stylesheet";

export interface TransformAssetsContext {
  readonly url: string;
  readonly kind: AssetKind;
}

export type TransformAssetResult =
  | string
  | { readonly href: string; readonly crossOrigin?: AssetCrossOrigin };

export type TransformAssetsFn = (
  asset: TransformAssetsContext,
) => TransformAssetResult | Promise<TransformAssetResult>;

/** What a factory is handed: the request it runs for, or none while warming up. */
export type CreateTransformAssetsContext =
  | { readonly warmup: true }
  | { readonly warmup: false; readonly request: Request };

export type CreateTransformAssetsFn = (
  context: CreateTransformAssetsContext,
) => TransformAssetsFn | Promise<TransformAssetsFn>;

interface TransformAssetsCaching {
  /**
   * Transform once and reuse the result for every request. On by default; off
   * for a transform that reads the request, such as a CDN chosen by region.
   */
  readonly cache?: boolean;
  /** Run a cached transform when the handler is created rather than on the first request. */
  readonly warmup?: boolean;
}

export type TransformAssets =
  /** A prefix for every asset URL; an empty string changes nothing. */
  | string
  | TransformAssetsFn
  | {
      readonly prefix: string;
      readonly crossOrigin?: AssetCrossOrigin | Partial<Record<AssetKind, AssetCrossOrigin>>;
    }
  | (TransformAssetsCaching & { readonly transform: string | TransformAssetsFn })
  | (TransformAssetsCaching & { readonly createTransform: CreateTransformAssetsFn });

export interface ClientAssets {
  readonly scripts?: readonly string[];
  readonly css?: readonly string[];
  /** The build's atoms, linked after every other stylesheet. */
  readonly atoms?: string;
  /** What the entry imports on its way to hydrating, preloaded beside the route chain. */
  readonly preload?: readonly string[];
}

/** The page handler's asset inputs, the shape `transformAssets` rewrites. */
export interface PageAssets {
  readonly clientAssets?: ClientAssets;
  readonly routeAssets?: Readonly<Record<string, readonly string[]>>;
  readonly routeCss?: Readonly<Record<string, readonly string[]>>;
  readonly moduleAssets?: AssetManifest;
}

/** The rewritten inputs, and the `crossorigin` each rewritten URL is fetched with. */
export interface TransformedAssets extends PageAssets {
  readonly crossOrigin?: (href: string) => AssetCrossOrigin | undefined;
}

function prefixed(prefix: string): TransformAssetsFn {
  return ({ url }) => (prefix === "" || /^[a-z][a-z\d+.-]*:/i.test(url) ? url : `${prefix}${url}`);
}

interface AssetTransformFactory {
  create: CreateTransformAssetsFn;
  cache: boolean;
  warmup: boolean;
}

function factoryOf(option: TransformAssets): AssetTransformFactory {
  if (typeof option === "string" || typeof option === "function") {
    const transform = typeof option === "string" ? prefixed(option) : option;
    return { create: () => transform, cache: true, warmup: false };
  }
  if ("prefix" in option) {
    const base = prefixed(option.prefix);
    const crossOrigin = option.crossOrigin;
    const transform: TransformAssetsFn = (asset) => {
      const href = base(asset) as string;
      const value = typeof crossOrigin === "object" ? crossOrigin[asset.kind] : crossOrigin;
      return value === undefined ? href : { href, crossOrigin: value };
    };
    return { create: () => transform, cache: true, warmup: false };
  }
  const cache = option.cache ?? true;
  const warmup = option.warmup ?? false;
  if ("createTransform" in option) return { create: option.createTransform, cache, warmup };
  const transform =
    typeof option.transform === "string" ? prefixed(option.transform) : option.transform;
  return { create: () => transform, cache, warmup };
}

interface TransformedHref {
  href: string;
  crossOrigin?: AssetCrossOrigin;
}

/**
 * Every URL the inputs name, rewritten once each. A module manifest given as a
 * function is wrapped and rewritten as it is asked, since its URLs are not
 * known ahead.
 */
async function rewrite(
  assets: PageAssets,
  transform: TransformAssetsFn,
): Promise<TransformedAssets> {
  const done = new Map<string, Promise<TransformedHref>>();
  const crossOrigin = new Map<string, AssetCrossOrigin>();
  function one(url: string, kind: AssetKind) {
    const key = `${kind}\n${url}`;
    let pending = done.get(key);
    if (pending === undefined) {
      pending = Promise.resolve(transform({ url, kind })).then((result) => {
        const resolved = typeof result === "string" ? { href: result } : result;
        if (resolved.crossOrigin !== undefined)
          crossOrigin.set(resolved.href, resolved.crossOrigin);
        return resolved;
      });
      done.set(key, pending);
    }
    return pending;
  }
  async function list(urls: readonly string[] | undefined, kind: AssetKind) {
    return urls === undefined
      ? undefined
      : await Promise.all(urls.map(async (url) => (await one(url, kind)).href));
  }
  async function table(
    map: Readonly<Record<string, readonly string[]>> | undefined,
    kind: AssetKind,
  ): Promise<Record<string, readonly string[]> | undefined> {
    return map === undefined
      ? undefined
      : Object.fromEntries(
          await Promise.all(
            Object.entries(map).map(async ([id, urls]) => [id, (await list(urls, kind)) ?? []]),
          ),
        );
  }
  async function moduleEntry(entry: ModuleAssets): Promise<ModuleAssets> {
    const js =
      entry.js === undefined ? [] : await Promise.all(entry.js.map((url) => one(url, "script")));
    const css =
      entry.css === undefined
        ? []
        : await Promise.all(entry.css.map((url) => one(url, "stylesheet")));
    const script = js.find((asset) => asset.crossOrigin !== undefined)?.crossOrigin;
    const stylesheet = css.find((asset) => asset.crossOrigin !== undefined)?.crossOrigin;
    return {
      ...entry,
      js: entry.js === undefined ? undefined : js.map((asset) => asset.href),
      css: entry.css === undefined ? undefined : css.map((asset) => asset.href),
      ...(script === undefined && stylesheet === undefined
        ? {}
        : { crossOrigin: { ...entry.crossOrigin, script, stylesheet } }),
    };
  }

  const client = assets.clientAssets;
  const [scripts, css, atoms, preload, routeAssets, routeCss] = await Promise.all([
    list(client?.scripts, "script"),
    list(client?.css, "stylesheet"),
    list(client?.atoms === undefined ? undefined : [client.atoms], "stylesheet"),
    list(client?.preload, "script"),
    table(assets.routeAssets, "script"),
    table(assets.routeCss, "stylesheet"),
  ]);
  let moduleAssets: AssetManifest | undefined;
  const manifest = assets.moduleAssets;
  if (typeof manifest === "function") {
    // Asked synchronously while a page renders. A transform that answers
    // synchronously, as a prefix does, rewrites the entry there and then; one
    // that answers with a promise cannot without holding the render, so that
    // entry's first answer is the build's own URLs and every later one is
    // rewritten.
    const cache = new Map<string, ModuleAssets>();
    function now(url: string, kind: AssetKind) {
      const result = transform({ url, kind });
      if (typeof result === "object" && "then" in result) return undefined;
      const resolved = typeof result === "string" ? { href: result } : result;
      if (resolved.crossOrigin !== undefined) crossOrigin.set(resolved.href, resolved.crossOrigin);
      return resolved;
    }
    moduleAssets = (moduleUrl) => {
      const known = cache.get(moduleUrl);
      if (known !== undefined) return known;
      const entry = manifest(moduleUrl);
      if (entry === undefined) return undefined;
      const chunks = entry.js?.map((url) => now(url, "script"));
      const sheets = entry.css?.map((url) => now(url, "stylesheet"));
      if (chunks?.includes(undefined) === true || sheets?.includes(undefined) === true) {
        void moduleEntry(entry).then((rewritten) => cache.set(moduleUrl, rewritten));
        return entry;
      }
      const script = chunks?.find((asset) => asset?.crossOrigin !== undefined)?.crossOrigin;
      const stylesheet = sheets?.find((asset) => asset?.crossOrigin !== undefined)?.crossOrigin;
      const rewritten: ModuleAssets = {
        ...entry,
        js: chunks?.map((asset) => asset!.href),
        css: sheets?.map((asset) => asset!.href),
        ...(script === undefined && stylesheet === undefined
          ? {}
          : { crossOrigin: { ...entry.crossOrigin, script, stylesheet } }),
      };
      cache.set(moduleUrl, rewritten);
      return rewritten;
    };
  } else if (manifest !== undefined) {
    moduleAssets = Object.fromEntries(
      await Promise.all(
        Object.entries(manifest).map(async ([url, entry]) => [url, await moduleEntry(entry)]),
      ),
    );
  }
  return {
    clientAssets:
      client === undefined ? undefined : { ...client, scripts, css, atoms: atoms?.[0], preload },
    routeAssets,
    routeCss,
    moduleAssets,
    crossOrigin: crossOrigin.size === 0 ? undefined : (href) => crossOrigin.get(href),
  };
}

/**
 * The page handler's assets for one request. `undefined` when nothing is to be
 * rewritten, so a handler with no `transformAssets` pays nothing.
 */
export function createAssetTransform(
  option: TransformAssets | undefined,
  assets: PageAssets,
): ((request: Request) => Promise<TransformedAssets>) | undefined {
  if (option === undefined || option === "") return undefined;
  const { create, cache, warmup } = factoryOf(option);
  if (!cache) {
    return async (request) => rewrite(assets, await create({ warmup: false, request }));
  }
  let cached: Promise<TransformedAssets> | undefined;
  function start(context: CreateTransformAssetsContext): Promise<TransformedAssets> {
    cached = Promise.resolve(create(context)).then((transform) => rewrite(assets, transform));
    // A failed transform is not cached: the next request tries again.
    cached.catch(() => (cached = undefined));
    return cached;
  }
  if (warmup) void start({ warmup: true }).catch((error: unknown) => console.error(error));
  return (request) => cached ?? start({ warmup: false, request });
}
