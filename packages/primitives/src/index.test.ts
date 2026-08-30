/**
 * The barrel is complete, and it re-exports rather than re-implements.
 *
 * Every module here is both a subpath entry and a name in `./index.ts`, which
 * is two lists that have to agree. A primitive added to a module and forgotten
 * in the barrel is invisible to anyone importing from the package root, and
 * nothing else in the suite would notice: the module's own tests import it
 * directly.
 */

import { readdirSync } from "node:fs";

import { describe, expect, test } from "bun:test";

import * as barrel from "./index.ts";

import * as animation from "./animation.ts";
import * as browser from "./browser.ts";
import * as bus from "./bus.ts";
import * as clipboard from "./clipboard.ts";
import * as collections from "./collections.ts";
import * as derived from "./derived.ts";
import * as element from "./element.ts";
import * as event from "./event.ts";
import * as focus from "./focus.ts";
import * as fullscreen from "./fullscreen.ts";
import * as geolocation from "./geolocation.ts";
import * as history from "./history.ts";
import * as keyboard from "./keyboard.ts";
import * as machine from "./machine.ts";
import * as media from "./media.ts";
import * as mouse from "./mouse.ts";
import * as observers from "./observers.ts";
import * as promise from "./promise.ts";
import * as raf from "./raf.ts";
import * as refs from "./refs.ts";
import * as scheduled from "./scheduled.ts";
import * as scroll from "./scroll.ts";
import * as storage from "./storage.ts";
import * as timer from "./timer.ts";
import * as utils from "./utils.ts";
import * as virtual from "./virtual.ts";
import * as websocket from "./websocket.ts";

const MODULES: Record<string, Record<string, unknown>> = {
  animation,
  browser,
  bus,
  clipboard,
  collections,
  derived,
  element,
  event,
  focus,
  fullscreen,
  geolocation,
  history,
  keyboard,
  machine,
  media,
  mouse,
  observers,
  promise,
  raf,
  refs,
  scheduled,
  scroll,
  storage,
  timer,
  utils,
  virtual,
  websocket,
};

describe("the root entry", () => {
  test("re-exports every value every module exports", () => {
    const missing: string[] = [];
    for (const [name, module] of Object.entries(MODULES)) {
      for (const exported of Object.keys(module)) {
        if (!(exported in barrel)) missing.push(`${name}: ${exported}`);
      }
    }
    expect(missing, "these are importable from a subpath but not from the root").toEqual([]);
  });

  test("re-exports the same binding, so state is not duplicated", () => {
    const split: string[] = [];
    for (const [name, module] of Object.entries(MODULES)) {
      for (const [exported, value] of Object.entries(module)) {
        if (!(exported in barrel)) continue;
        if ((barrel as Record<string, unknown>)[exported] !== value) {
          split.push(`${name}: ${exported}`);
        }
      }
    }
    expect(split).toEqual([]);
  });

  test("exports nothing that no module owns", () => {
    const owned = new Set(Object.values(MODULES).flatMap((module) => Object.keys(module)));
    const strays = Object.keys(barrel).filter((name) => !owned.has(name));
    expect(strays, "the barrel declares a name no module exports").toEqual([]);
  });

  test("every module on disk is in the list above, and has a test beside it", () => {
    // A module added without a test, or without a line in `MODULES`, is
    // invisible to every other check in this file: the barrel would not be
    // asked about it and the subpath comparison would not miss it.
    const files = readdirSync(import.meta.dir).filter(
      (name) => name.endsWith(".ts") && !name.endsWith(".d.ts"),
    );

    const sources = files
      .filter((name) => !name.includes(".test."))
      .map((name) => name.replace(/\.ts$/, ""))
      // Neither is a module: one wires happy-dom into `bun test`, the other is
      // the script `server.test.ts` spawns without a DOM.
      .filter((name) => name !== "test-setup" && name !== "server-probe" && name !== "index");

    expect(sources.toSorted()).toEqual(Object.keys(MODULES).toSorted());

    const untested = sources.filter((name) => !files.includes(`${name}.test.ts`));
    expect(untested, "these modules have no test file").toEqual([]);
  });

  test("the module list here matches the package's subpath exports", async () => {
    const manifest = (await Bun.file(
      new URL("../package.json", import.meta.url).pathname,
    ).json()) as { exports: Record<string, unknown> };

    const subpaths = Object.keys(manifest.exports)
      .filter((key) => key !== ".")
      .map((key) => key.slice(2))
      .toSorted();

    expect(Object.keys(MODULES).toSorted()).toEqual(subpaths);
  });
});
