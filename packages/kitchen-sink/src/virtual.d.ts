/**
 * The two build-generated modules that have no types of their own.
 *
 * A SCRIPT file, not a module: an ambient `declare module` inside a file with a
 * top-level `import`/`export` is an AUGMENTATION of a module that must already
 * exist, so declaring these beside `barq.d.ts`'s `declare global` block made
 * every one of them "cannot find module".
 *
 * `virtual:barq-routes` is NOT here — `src/routes.gen.d.ts` declares it, and the
 * generator owns that file.
 */

declare module "virtual:barq-route-assets" {
  const routeAssets: Record<string, string[]>;
  export { routeAssets };
  export default routeAssets;
}

declare module "virtual:barq-client-assets" {
  const clientAssets: { readonly scripts: readonly string[]; readonly css: readonly string[] };
  export { clientAssets };
  export default clientAssets;
}
