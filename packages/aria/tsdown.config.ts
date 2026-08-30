import { createRequire } from "node:module";
import { defineConfig } from "tsdown";

const TSX = new Set([
  "breadcrumbs",
  "button",
  "calendar",
  "checkbox",
  "colorpicker",
  "combobox",
  "datefield",
  "datepicker",
  "dialog",
  "disclosure",
  "form",
  "gridlist",
  "link",
  "listbox",
  "menu",
  "numberfield",
  "radio",
  "select",
  "slider",
  "switch",
  "table",
  "tabs",
  "tag",
  "textfield",
  "toolbar",
  "tooltip",
  "virtualizer",
]);

const modules = [
  "breadcrumbs",
  "button",
  "calendar",
  "checkbox",
  "collections",
  "color",
  "colorpicker",
  "combobox",
  "date",
  "datefield",
  "datepicker",
  "dialog",
  "disclosure",
  "dom",
  "focus",
  "form",
  "gridlist",
  "i18n",
  "interactions",
  "label",
  "link",
  "listbox",
  "live",
  "menu",
  "numberfield",
  "overlays",
  "platform",
  "radio",
  "select",
  "selection",
  "slider",
  "switch",
  "table",
  "tabs",
  "tag",
  "textfield",
  "toggle",
  "toolbar",
  "tooltip",
  "utils",
  "validation",
  "virtualizer",
];

const require_ = createRequire(import.meta.url);
const native = require_("@barqjs/compiler-rs") as {
  transform(code: string, options?: Record<string, unknown>): { code: string };
};

/**
 * The components are `.tsx`, so the BUILD runs the barq compiler over them.
 *
 * Without this they go through rolldown's generic JSX transform and get
 * different semantics: props arrive as values rather than Cells, and children
 * are built eagerly rather than as Blocks. What ships would then behave
 * differently from what the suite exercises, which goes through the compiler
 * via the test preload.
 *
 * Consumers pay nothing for it: `dist` is already lowered, so an application
 * without the compiler still uses these components.
 */
const barq = {
  name: "barq",
  transform(code: string, id: string): { code: string } | null {
    if (!id.endsWith(".tsx")) return null;
    return { code: native.transform(code, { filename: id }).code };
  },
};

export default defineConfig({
  entry: [
    "./src/index.ts",
    ...modules.map((name) => `./src/${name}${TSX.has(name) ? ".tsx" : ".ts"}`),
  ],
  format: ["esm"],
  // `exports` names `.js`/`.d.ts`; tsdown 0.22 defaults to `.mjs`/`.d.mts`.
  outExtensions: () => ({ js: ".js", dts: ".d.ts" }),
  dts: true,
  clean: true,
  plugins: [barq],
  external: ["@barqjs/core", "@barqjs/primitives"],
});
