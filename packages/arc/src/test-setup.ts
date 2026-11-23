// FIRST. It registers the DOM before anything reads `typeof document`, and the
// compiler before the first `.tsx` is loaded.
import * as compiling from "./compile-setup.ts";

void compiling;

import * as testing from "@barqjs/testing";

void testing;

import { afterEach } from "bun:test";
import { resetErrorHalt } from "@barqjs/core";
import { resetInteractionModality } from "@barqjs/aria/interactions";
import { destroyAnnouncer } from "@barqjs/aria/live";

afterEach(() => {
  resetErrorHalt();
  resetInteractionModality();
  // The page's one live region outlives the test that announced into it, and
  // a pending button leaves a node there naming its own id, which a later
  // test's element can be given.
  destroyAnnouncer();
});
