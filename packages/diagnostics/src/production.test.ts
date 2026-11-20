/**
 * The default export condition resolves the engine's production build, where
 * there is nothing to capture. Both entry points have to say so instead of
 * returning an empty artifact.
 */
import { expect, test } from "bun:test";
import { OBSERVE } from "@barqjs/core";

import { installDiagnosticsBridge } from "./browser.ts";
import { captureArtifact } from "./index.ts";

const development = OBSERVE !== undefined;

test.if(!development)("captureArtifact rejects and names the condition to resolve", async () => {
  let ran = false;
  const capture = captureArtifact(() => {
    ran = true;
  });
  await expect(capture).rejects.toThrow(
    "@barqjs/diagnostics needs the development build of @solidjs/signals.",
  );
  await expect(capture).rejects.toThrow("bun test --conditions=development");
  expect(ran).toBe(false);
});

test.if(!development)("installDiagnosticsBridge throws and installs nothing", () => {
  const realm: Record<string, unknown> = {};
  expect(() => installDiagnosticsBridge(realm)).toThrow(
    "@barqjs/diagnostics needs the development build of @solidjs/signals.",
  );
  expect(realm).toEqual({});
});

test.if(development)("captureArtifact resolves under the development condition", async () => {
  const { result, artifact } = await captureArtifact(() => "done");
  expect(result).toBe("done");
  expect(artifact.diagnostics).toEqual([]);
});
