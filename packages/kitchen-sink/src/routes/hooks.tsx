/**
 * `/hooks` — CLIENT-ONLY, because one of the hooks it demonstrates cannot run
 * on a server.
 *
 * `useKeyboard` from `@barqjs/extra` opens an effect that binds `document` at
 * construction, so rendering this route on the string backend throws
 * `ReferenceError: document is not defined` — inside its own error boundary,
 * which is exactly the shape `errorComponent`-less boundaries used to swallow.
 *
 * `ssr = false` is the front door's answer to a route that cannot be rendered
 * on a server: the server emits this depth's `pending` fallback and the browser
 * builds the rest.
 */

export const ssr = false;

export { HooksDemo as default } from "../demos/HooksDemo";

export function Pending() {
  return <p style="color:#94a3b8">Loading the hooks demo…</p>;
}
