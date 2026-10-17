// FIRST. See `./register-dom.ts` for why the registration cannot live here.
import * as dom from "./register-dom.ts";

void dom;

import { plugin } from "bun";
import { compilerLoader } from "@barqjs/vite/internal";

plugin(compilerLoader());

import * as testing from "@barqjs/testing";

void testing;

import { afterEach } from "bun:test";
import { resetErrorHalt } from "@barqjs/core";
import { resetInteractionModality } from "./interactions/modality.ts";

// An error nothing catches halts the reactive engine for good. The test that
// provoked it has failed on its own account; the halt must not fail the next.
//
// Whether the last interaction was a pointer, a key or a screen reader is
// global too, and decides what the next test's first focus does: a suite must
// not pass or fail by which file ran before it.
afterEach(() => {
  resetErrorHalt();
  resetInteractionModality();
});
