/**
 * What every component suite in arc repeats: settling the scheduler, and a
 * server render hydrated in place with nothing rebuilt.
 */

import { expect } from "bun:test";
import { flush } from "@barqjs/core";
import { type HydrationResult, renderAndHydrate, tick } from "@barqjs/testing";

import { halves } from "./ssr-harness.ts";

export async function settle(): Promise<void> {
  flush();
  await tick();
  flush();
}

/**
 * `source` exports `Page`, written once for the server and once for the
 * browser; the browser's half claims the server's markup with no mismatch,
 * no rebuild and every node kept.
 */
export async function hydrates(source: string): Promise<HydrationResult> {
  const { server, client } = await halves(source);
  const result = renderAndHydrate({ server, client });
  expect(result.mismatches).toEqual([]);
  expect(result.recovered).toBe(false);
  expect(result.reuse).toBe(1);
  return result;
}

/** Every class of a composed group is on the element. */
export function wears(element: Element | null | undefined, group: string): boolean {
  if (element === null || element === undefined) return false;
  return group.split(" ").every((one) => one === "" || element.classList.contains(one));
}
