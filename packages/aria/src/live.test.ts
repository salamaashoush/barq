import { afterEach, describe, expect, test } from "bun:test";

import { announce, destroyAnnouncer } from "./live.ts";

function said(): string[] {
  return [...document.querySelectorAll('[data-barq-live-announcer] [role="log"] > div')].map(
    (entry) => entry.textContent ?? "",
  );
}

afterEach(destroyAnnouncer);

describe("the live announcer", () => {
  test("an announcement lands in a region that is in the document", () => {
    announce("three results");
    expect(said()).toEqual(["three results"]);
  });

  test("a region the page removed is made again for the next announcement", () => {
    announce("three results");
    // An application that replaces the body's content takes the region with it.
    document.body.textContent = "";
    expect(said()).toEqual([]);

    announce("no results");
    expect(said()).toEqual(["no results"]);
    expect(document.querySelectorAll("[data-barq-live-announcer]")).toHaveLength(1);
  });

  test("an announcement taken back leaves the region, and the others stay", () => {
    const first = announce("three results");
    announce("saved");
    first();
    expect(said()).toEqual(["saved"]);
    first();
    expect(said()).toEqual(["saved"]);
  });
});
