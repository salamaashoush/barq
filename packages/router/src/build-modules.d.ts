/**
 * The specifiers the FRAMEWORK imports, declared here so no application declares
 * them.
 *
 * `client.ts` and `server.ts` in this package import these. No file an
 * application writes does, which is the whole point: grepped across both of
 * TanStack's examples, user code names no `virtual:` and no `#` specifier at
 * all. Theirs are declared the same way and in the same place, inside the
 * package.
 *
 * It was the other way round, and the cost was visible: the generated entries
 * named all four, so overriding an entry meant transcribing them, and
 * `packages/kitchen-sink/src/virtual.d.ts` existed for no other reason than to
 * make that transcription typecheck.
 *
 * A SCRIPT file, not a module: an ambient `declare module` inside a file with a
 * top-level `import` or `export` is an AUGMENTATION of a module that must
 * already exist, and these do not.
 *
 * NO ROUTE TYPES TRAVEL THROUGH HERE, and none should. `routeTree.gen.ts`
 * augments `Register` (`register.ts`) and `tsconfig.json`'s `include` puts that
 * file in the program whether or not anything imports it, so `Link`'s `to`,
 * `RouteId` and `RoutePath` are exactly as precise as before. `RouterConfig`'s
 * `routeTree` is `readonly AnyRouteDefinition[]`, which carried no route types
 * to begin with.
 */

/**
 * The project's own `src/router.ts`, or a generated stand-in re-exporting the
 * table when it has not written one.
 *
 * An ALIAS to a real file, which is why it is `#`-prefixed rather than
 * `virtual:`. TanStack's `#tanstack-router-entry` resolves to the project's
 * `src/router.tsx` the same way.
 */
declare module "#barq-router-entry" {
  const config: import("./router.ts").RouterConfig;
  export { config };
}

/** Route id -> the client chunks that route needs, for `<link rel=modulepreload>`. */
declare module "virtual:barq-route-assets" {
  const routeAssets: Readonly<Record<string, readonly string[]>>;
  const routeCss: Readonly<Record<string, readonly string[]>>;
  export { routeAssets, routeCss };
  export default routeAssets;
}

/** What the client build emitted, for the server half to place in the document. */
declare module "virtual:barq-client-assets" {
  const clientAssets: {
    readonly scripts?: readonly string[];
    readonly css?: readonly string[];
  };
  export { clientAssets };
  export default clientAssets;
}

/**
 * Side-effect only: importing it MOUNTS every server function the build found,
 * which is what gives each one its `/_barq/fn/<id>` URL. Reaching it from a
 * CLIENT module would put the whole server registry in the browser bundle.
 */
declare module "virtual:barq-server-fns" {}
