/**
 * Installs the document as the host `@barqjs/core`'s components render
 * through when no owner provides one.
 *
 * A side-effect module rather than a call `render` makes: compiled code lowers
 * every construct onto `branch` and `each` here, which carry the host
 * themselves, so only a module that still calls `<Show>` or `<For>` as a
 * component needs the components to find one. The compiler imports this module
 * into exactly those, and a page that never does ships no list reorder it does
 * not use.
 */

import { setDefaultHost } from "@barqjs/core/internal";

import { DOM_HOST, syncRowsDom } from "./dom-host.ts";

setDefaultHost(DOM_HOST, syncRowsDom);
