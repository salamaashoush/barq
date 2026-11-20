/**
 * The driver's half of the browser bridge. Playwright is typed structurally,
 * so it is not a dependency: any page-like object with a compatible `evaluate`
 * works.
 *
 * Nothing here may import the engine at run time. The app's instance lives in
 * the page, and importing it in the driver would make a second, unrelated one.
 */
import { artifactFromPayload } from "./artifact.ts";
import type { DiagnosticsBridge } from "./browser.ts";
import type { BridgeBeginOptions, BridgePayload, DiagnosticsArtifact } from "./types.ts";

export interface EvaluatingPage {
  evaluate<R, Arg>(pageFunction: (arg: Arg) => R, arg: Arg): Promise<R>;
  evaluate<R>(pageFunction: () => R): Promise<R>;
}

export type BrowserCaptureOptions = BridgeBeginOptions;

export interface BrowserCaptureResult<T> {
  result: T;
  artifact: DiagnosticsArtifact;
}

type Realm = { __BARQ_DIAGNOSTICS__?: DiagnosticsBridge };

/**
 * Capture a scripted browser interaction as the same artifact
 * `captureArtifact` returns, so every assertion and budget applies to it.
 */
export async function captureBrowserArtifact<T, P extends EvaluatingPage>(
  page: P,
  interact: (page: P) => T | Promise<T>,
  options: BrowserCaptureOptions = {},
): Promise<BrowserCaptureResult<T>> {
  // The page functions are serialized into the page, so they close over nothing.
  await page.evaluate((begin: BridgeBeginOptions) => {
    const bridge = (globalThis as Realm).__BARQ_DIAGNOSTICS__;
    if (bridge === undefined) {
      throw new Error(
        '@barqjs/diagnostics bridge not found in the page. Add `barqDiagnostics()` from "@barqjs/diagnostics/vite" ' +
          'to the Vite plugins, or call installDiagnosticsBridge() from "@barqjs/diagnostics/browser" in the dev entry.',
      );
    }
    bridge.begin(begin);
  }, options);

  let result: T;
  try {
    result = await interact(page);
  } catch (error) {
    // A failed interaction must not leave its session open for the next capture.
    await page
      .evaluate(() => {
        const bridge = (globalThis as Realm).__BARQ_DIAGNOSTICS__;
        if (bridge?.active() === true) bridge.end();
      })
      .catch(() => {});
    throw error;
  }

  const payload = await page.evaluate((): BridgePayload =>
    (globalThis as Realm).__BARQ_DIAGNOSTICS__!.end(),
  );
  return { result, artifact: artifactFromPayload(payload) };
}
