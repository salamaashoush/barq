/**
 * `?raw`, which Vite answers with the file's text and TypeScript does not know
 * about. The suite's loader answers the same query in `test-setup.ts`.
 */
declare module "*?raw" {
  const source: string;
  export default source;
}
