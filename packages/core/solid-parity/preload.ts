/**
 * Parity-suite preload. Solid's suite uses bun-compatible globals, so barq's
 * own DOM registration is the whole adaptation layer; the two vitest-isms the
 * suite does use (`vi`, chai's `.to`) are handled by `vitest.ts` and by
 * `port.ts` respectively.
 */
import "../src/test-setup.ts";
