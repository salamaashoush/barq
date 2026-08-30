/**
 * happy-dom globals.
 *
 * The registry writes to a `<style>` element when there is a document, and
 * that branch is the one dev and `bun test` both take — so a suite without a
 * DOM would only ever exercise the server half.
 */
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register();
