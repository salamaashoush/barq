/**
 * The two build-generated modules that have no types of their own.
 *
 * A SCRIPT file, not a module: an ambient `declare module` inside a file with a
 * top-level `import`/`export` is an AUGMENTATION of a module that must already
 * exist, so declaring these beside `barq.d.ts`'s `declare global` block made
 * every one of them "cannot find module".
 *
 * THE ROUTE TABLE IS NOT HERE. It is `src/routeTree.gen.ts`, a real module the
 * application imports by path — so it needs no ambient declaration, and it
 * carries its own types rather than a `.d.ts` beside it.
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

/**
 * Side-effect only: importing it MOUNTS every server function the build found,
 * which is what gives each one its `/_barq/fn/<id>` URL. A server entry that
 * omits the import ships an app whose every server function 404s — and whose
 * route-action check has an empty registry to ask.
 */
declare module "virtual:barq-server-fns" {}
