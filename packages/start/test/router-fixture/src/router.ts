/**
 * What a project writes when it wants to configure the router.
 *
 * The point of the file is what it does NOT contain: no `virtual:` specifier and
 * no `#barq-` specifier. The route table arrives by an ordinary relative import,
 * which is theirs exactly (`examples/solid/start-basic/src/router.tsx` imports
 * `./routeTree.gen` and nothing else unusual).
 */

export const config = {
  routeTree: [{ id: "__root__", path: "/" }],
  scrollRestoration: true,
};
