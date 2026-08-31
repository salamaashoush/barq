/**
 * `import.meta.glob`, which Vite provides and TypeScript does not know about.
 *
 * `vite/client` declares this, but referencing it here would put every one of
 * Vite's ambient types into the package's own type-check — including a `*.css`
 * module declaration that would make a missing stylesheet compile. This is the
 * one member the gallery uses, and nothing else.
 */
interface ImportMeta {
  glob(pattern: string): Record<string, () => Promise<unknown>>;
}
