# Assertions restated for the console format and source positions

Every expectation below changed because the console sink now prints barq's own
findings in the engine's shape (`[CODE] message`, then `in`, then `at`) and ends
the first report of a code with the docs page and the repair guide. Nothing was
removed or skipped.

## Console prefix: `[barq] CODE: ` became `[CODE] `

- `packages/web/src/dev-console.test.ts`: two `toStartWith` checks on
  `RENDER_SUBTREE_NOT_OWNED`, and the exact text of `BIND_TARGET_NOT_WRITABLE`,
  whose trailing `  docs: <url>` line became the two footer lines.
- `packages/web/src/diagnostics.test.ts`: "the console line says where it
  happened and where the fix is written down" now checks `formatDiagnostic` for
  the message and the `in` line, and `diagnosticFooter` for the page and guide.
- `packages/testing/src/hydrate.test.tsx`, `packages/router/src/client.test.ts`:
  `HYDRATION_MISMATCH` prefix.
- `packages/router/src/shell-head.test.ts`: `LATE_HEADER_WRITE` prefix.

## Marker of the development-only sink

- `packages/web/src/dev-console.test.ts`: `MARKER` was `"[barq] "`, which the
  sink no longer prints. It is `"agent repair guide"`, text only the sink holds.
- `packages/vite/test/dev-only.test.ts`: a production bundle is also checked for
  `"agent repair guide"`. The `"[barq] "` check stays.

## Component call carries its position

- `packages/vite/test/dev-only.test.ts`: the development marker `"Greeting")`
  became `"Greeting", "src/main.tsx:`, since the call now has a fourth argument.
