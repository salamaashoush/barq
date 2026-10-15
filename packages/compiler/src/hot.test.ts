/**
 * What the development server adds to a module so its components can be
 * replaced in place.
 */

import { describe, expect, test } from "bun:test";
import { parseAst } from "vite";

import { withHotComponents } from "./vite.ts";

function rewrite(code: string, components: string[]): string {
  return withHotComponents(code, new Set(components), parseAst(code, { lang: "ts" }) as never);
}

const REBOUND = (name: string): string =>
  ` if (import.meta.hot) ${name} = __barq_hot(import.meta.hot, "${name}", ${name}, `;

const signature = (out: string, name: string): string | null => {
  const found = new RegExp(
    `__barq_hot\\(import\\.meta\\.hot, "${name}", ${name}, (null|"[^"]*")\\)`,
  ).exec(out);
  if (found === null) throw new Error(`${name} is not rebound`);
  return JSON.parse(found[1] ?? "null") as string | null;
};

describe("a module's components are handed out through hot", () => {
  test("each declaration is rebound on the line it ends on, and a const becomes a let", () => {
    const code = [
      `export const Card = (props) => {`,
      `  return props.title();`,
      `};`,
      `function Row() { return 1; }`,
      `export default Row;`,
    ].join("\n");
    const out = rewrite(code, ["Card", "Row"]);
    const lines = out.split("\n");
    expect(lines[0]).toBe("export let   Card = (props) => {");
    expect(lines[2]?.startsWith(`};${REBOUND("Card")}`)).toBe(true);
    expect(lines[3]?.startsWith(`function Row() { return 1; }${REBOUND("Row")}`)).toBe(true);
    expect(lines[4]).toBe("export default Row;");
    expect(out).toContain(`import { hot as __barq_hot } from "@barqjs/core/hot";`);
  });

  test("a module that exports only components takes its own updates", () => {
    const out = rewrite(`export function Page() { return 1; }\nconst helper = 2;`, ["Page"]);
    expect(out).toContain("import.meta.hot.accept();");
  });

  test("a module that also exports a value leaves the update to its importers", () => {
    const out = rewrite(`export const store = {};\nexport function Page() { return store; }`, [
      "Page",
    ]);
    expect(out).toContain(REBOUND("Page"));
    expect(out).not.toContain("import.meta.hot.accept()");
  });

  test("a re-export or a star export is not a component", () => {
    for (const extra of [`export { other } from "./other";`, `export * from "./other";`]) {
      const out = rewrite(`export function Page() { return 1; }\n${extra}`, ["Page"]);
      expect(out).not.toContain("import.meta.hot.accept()");
    }
  });

  test("types are still in the module, and exporting one does not stop it accepting", () => {
    const code = [
      `export interface PageProps { title: () => string }`,
      `export type Size = "sm" | "lg";`,
      `export function Page(props: PageProps): unknown { return props.title(); }`,
    ].join("\n");
    const out = rewrite(code, ["Page"]);
    expect(out).toContain(REBOUND("Page"));
    expect(out).toContain("import.meta.hot.accept();");
  });

  test("a module with no component of its own is left exactly as it was", () => {
    const code = `export const value = 1;\nfunction helper() {}`;
    expect(rewrite(code, ["Elsewhere"])).toBe(code);
  });

  test("a nested function that shares a component's name is not touched", () => {
    const code = `export function Page() { function Row() {} return Row; }`;
    const out = rewrite(code, ["Page", "Row"]);
    expect(out.match(/__barq_hot\(/g)).toHaveLength(1);
  });

  test("an edit to one component moves that component's signature and no other", () => {
    const module = (title: string): string =>
      [
        `const _tmpl$1 = template("<h1>${title}</h1>");`,
        `const _tmpl$2 = template("<p></p>");`,
        `export function Title() { return _tmpl$1(); }`,
        `export function Body() { return _tmpl$2(); }`,
      ].join("\n");
    const before = rewrite(module("orders"), ["Title", "Body"]);
    const after = rewrite(module("invoices"), ["Title", "Body"]);
    expect(signature(after, "Title")).not.toBe(signature(before, "Title"));
    expect(signature(after, "Body")).toBe(signature(before, "Body"));
    expect(signature(before, "Body")).not.toBeNull();
  });

  test("a component that names module state is replaced on every update", () => {
    const code = [
      `const [count, setCount] = createSignal(0);`,
      `const format = (value) => String(value);`,
      `export function Counter() { return count(); }`,
      `export function Label() { return format(1); }`,
      `export function Plain() { return 1; }`,
    ].join("\n");
    const out = rewrite(code, ["Counter", "Label", "Plain"]);
    expect(signature(out, "Counter")).toBeNull();
    expect(signature(out, "Label")).toBeNull();
    expect(signature(out, "Plain")).not.toBeNull();
  });
});
