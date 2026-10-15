import { beforeEach, describe, expect, test } from "bun:test";

import { collectRequestCss, installCssSink, withRequest } from "./context.ts";

interface CssSink {
  (key: string, rules: string): boolean;
  head?(late: () => string): void;
}

/**
 * `@barqjs/css` itself, which this package deliberately does not depend on.
 *
 * Loaded by a computed path so the declaration build, which follows every
 * static import under `src`, does not follow this one into another package.
 */
const source = (file: string): string => new URL(`../../css/src/${file}`, import.meta.url).href;
const { atoms, collectCss, setCssSink } = (await import(source("index.ts"))) as {
  atoms(...styles: object[]): string;
  collectCss(): string;
  setCssSink(sink: CssSink | null): void;
};
const { resetCss } = (await import(source("internal.ts"))) as { resetCss(): void };

const count = (text: string, needle: string): number => text.split(needle).length - 1;

function gate(): { opened: Promise<void>; open(): void } {
  let open = (): void => {};
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { opened, open };
}

beforeEach(() => {
  resetCss();
  installCssSink(setCssSink);
});

describe("a request's two sheets", () => {
  test("hold a rule another request registered after this one read its head", async () => {
    const shared = atoms({ color: "red" });
    const headRead = gate();
    const registered = gate();

    const second = withRequest(new Request("http://localhost/b"), async () => {
      const head = collectCss();
      headRead.open();
      await registered.opened;
      const used = atoms({ color: "blue" });
      return { head, late: collectRequestCss(), used };
    });
    const first = withRequest(new Request("http://localhost/a"), async () => {
      await headRead.opened;
      const head = collectCss();
      const used = atoms({ color: "blue" });
      registered.open();
      return { head, late: collectRequestCss(), used };
    });

    for (const page of await Promise.all([first, second])) {
      expect(count(page.head + page.late, `.${page.used}{color:blue}`)).toBe(1);
      expect(count(page.head + page.late, `.${shared}{color:red}`)).toBe(1);
      expect(page.head).not.toContain(page.used);
    }
  });

  test("carry nothing late once the rule is in the head", async () => {
    await withRequest(new Request("http://localhost/a"), async () => {
      collectCss();
      atoms({ color: "blue" });
    });
    const page = await withRequest(new Request("http://localhost/b"), async () => {
      const head = collectCss();
      const used = atoms({ color: "blue" });
      return { head, late: collectRequestCss(), used };
    });
    expect(page.head).toContain(page.used);
    expect(page.late).toBe("");
  });

  test("keep what a render registered when it read no head", async () => {
    atoms({ color: "red" });
    const page = await withRequest(new Request("http://localhost/a"), async () => {
      const used = atoms({ color: "blue" });
      return { late: collectRequestCss(), used };
    });
    expect(page.late).toBe(`.${page.used}{color:blue}`);
  });

  test("order the late sheet by tier", async () => {
    const page = await withRequest(new Request("http://localhost/a"), async () => {
      collectCss();
      const wide = atoms({ width: { "@media (min-width: 900px)": 3 } });
      const narrow = atoms({ width: { "@media (min-width: 300px)": 2 } });
      const base = atoms({ width: 1 });
      return { late: collectRequestCss(), order: [base, narrow, wide] };
    });
    const found = page.order.map((name) => page.late.indexOf(name));
    expect(found.every((index) => index >= 0)).toBe(true);
    expect(found).toEqual(found.toSorted((a, b) => a - b));
  });

  test("are empty outside a request", () => {
    atoms({ color: "blue" });
    expect(collectRequestCss()).toBe("");
  });
});
