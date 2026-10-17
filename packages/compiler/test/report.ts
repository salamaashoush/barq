import { writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * What a suite measured, for a reader rather than for an assertion. A green run
 * prints nothing but bun's own results, so the summary is written beside the
 * suites as `test/.<name>.txt`, and printed as well under `BARQ_TEST_REPORT=1`.
 */
export function writeReport(name: string, text: string): void {
  writeFileSync(join(import.meta.dir, `.${name}.txt`), `${text}\n`);
  if (process.env.BARQ_TEST_REPORT) console.log(text);
}
