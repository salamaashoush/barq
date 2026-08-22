/**
 * `/query` — `"data-only"`.
 *
 * The loader runs on the server and its value is SEEDED, so the client's first
 * read consumes it rather than refetching; the component is not rendered into
 * the HTML. What goes on the wire is this depth's `pending` fallback, which the
 * client replaces with real markup it builds itself.
 */

export const ssr = "data-only";

export { QueryDemo as default } from "../demos/QueryDemo";

export async function loader() {
  await new Promise((resolve) => setTimeout(resolve, 40));
  return { renderedOn: typeof document === "undefined" ? "server" : "client" };
}

export function Pending() {
  return <p style="color:#94a3b8">Loading query demo…</p>;
}
