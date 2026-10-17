/**
 * What a test printed through `console.warn` and `console.error` on purpose,
 * held off the run's output so the test can assert on it instead.
 */
import { afterEach, beforeEach, expect, spyOn } from "bun:test";

export async function printedBy(body: () => unknown): Promise<unknown[][]> {
  const warn = spyOn(console, "warn").mockImplementation(() => {});
  const error = spyOn(console, "error").mockImplementation(() => {});
  try {
    await body();
    return [...warn.mock.calls, ...error.mock.calls].map((call) => [...call]);
  } finally {
    warn.mockRestore();
    error.mockRestore();
  }
}

/**
 * Every line is the development console's report of `code`. It reports each
 * distinct finding once per process, so a test cannot count on its own copy.
 */
export function expectOnly(printed: unknown[][], code: string): void {
  for (const [line] of printed) expect(String(line)).toStartWith(`[barq] ${code}: `);
}

/**
 * Holds the console for each test in the enclosing `describe`, every one of
 * which provokes `code` on purpose, and fails a test that printed anything else.
 */
export function holdReports(code: string): void {
  let held: { mock: { calls: unknown[][] }; mockRestore(): void }[] = [];
  beforeEach(() => {
    held = [
      spyOn(console, "warn").mockImplementation(() => {}),
      spyOn(console, "error").mockImplementation(() => {}),
    ];
  });
  afterEach(() => {
    const printed = held.flatMap((spy) => spy.mock.calls.map((call) => [...call]));
    for (const spy of held) spy.mockRestore();
    expectOnly(printed, code);
  });
}
