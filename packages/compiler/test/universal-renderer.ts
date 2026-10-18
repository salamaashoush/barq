/**
 * The renderer module a fixture compiled for the universal target imports its
 * helpers from: `@barqjs/universal` over the in-memory host its own suite
 * tests with.
 */

import { createRenderer } from "@barqjs/universal";
import { createTestHost } from "../../universal/src/test-host.ts";

export const host = createTestHost();

export const {
  render,
  createElement,
  createTextNode,
  insertNode,
  setProp,
  insert,
  spread,
  branch,
  each,
  boundary,
  island,
  reveal,
  portal,
  dynamic,
  Portal,
} = createRenderer(host.ops);
