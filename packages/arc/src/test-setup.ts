// FIRST. It registers the DOM before anything reads `typeof document`, and the
// compiler before the first `.tsx` is loaded.
import * as compiling from "./compile-setup.ts";

void compiling;

import * as testing from "@barqjs/testing";

void testing;

import { afterEach } from "bun:test";
import { resetErrorHalt } from "@barqjs/core";
import { resetInteractionModality } from "@barqjs/aria/interactions";

afterEach(() => {
  resetErrorHalt();
  resetInteractionModality();
});
