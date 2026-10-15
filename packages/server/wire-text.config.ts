import type { UserConfig } from "tsdown";

// `exports` names `.js`/`.d.ts`; tsdown 0.22 defaults to `.mjs`/`.d.mts`.
export const outExtensions = (): { js: string; dts: string } => ({ js: ".js", dts: ".d.ts" });

interface Node {
  type: string;
  start: number;
  end: number;
  [key: string]: unknown;
}

const isNode = (value: unknown): value is Node =>
  typeof value === "object" && value !== null && typeof (value as Node).type === "string";

const FUNCTION = new Set(["ArrowFunctionExpression", "FunctionExpression", "FunctionDeclaration"]);

/**
 * Every top-level `f.toString()` whose `f` is a top-level function, replaced
 * by the text of that function as the minifier left it.
 *
 * A function's `toString()` is whatever its runtime or the next bundler
 * re-prints it as: Bun re-prints every module it loads, and an application's
 * bundler re-prints this one. A string literal survives both, so the bytes a
 * page gets are the ones this build minified. Only module scope is read, where
 * a name cannot be shadowed; nothing inside a function body is touched.
 */
function freezeFunctionText(): NonNullable<UserConfig["plugins"]> {
  return {
    name: "barq:freeze-function-text",
    generateBundle(_options, bundle) {
      for (const chunk of Object.values(bundle)) {
        if (chunk.type !== "chunk") continue;
        const code = chunk.code;
        const program = this.parse(code) as unknown as { body: Node[] };
        const functions = new Map<string, Node>();
        const declarators: Node[] = [];
        for (const raw of program.body) {
          const statement =
            raw.type === "ExportNamedDeclaration" && isNode(raw.declaration)
              ? raw.declaration
              : raw;
          if (statement.type === "FunctionDeclaration" && isNode(statement.id)) {
            functions.set(statement.id.name as string, statement);
          }
          if (statement.type !== "VariableDeclaration") continue;
          for (const declarator of statement.declarations as Node[]) {
            declarators.push(declarator);
            const { id, init } = declarator;
            if (isNode(id) && isNode(init) && FUNCTION.has(init.type)) {
              functions.set(id.name as string, init);
            }
          }
        }
        const edits: { start: number; end: number; text: string }[] = [];
        const visit = (node: Node): void => {
          if (FUNCTION.has(node.type)) return;
          const callee = node.callee;
          if (
            node.type === "CallExpression" &&
            (node.arguments as unknown[]).length === 0 &&
            isNode(callee) &&
            callee.type === "MemberExpression" &&
            !callee.computed &&
            isNode(callee.object) &&
            callee.object.type === "Identifier" &&
            isNode(callee.property) &&
            callee.property.name === "toString"
          ) {
            const target = functions.get(callee.object.name as string);
            if (target !== undefined) {
              edits.push({
                start: node.start,
                end: node.end,
                text: JSON.stringify(code.slice(target.start, target.end)),
              });
              return;
            }
          }
          for (const value of Object.values(node)) {
            if (Array.isArray(value)) {
              for (const item of value) if (isNode(item)) visit(item);
            } else if (isNode(value)) {
              visit(value);
            }
          }
        };
        for (const declarator of declarators) if (isNode(declarator.init)) visit(declarator.init);
        let next = code;
        for (const edit of edits.toSorted((a, b) => b.start - a.start)) {
          next = next.slice(0, edit.start) + edit.text + next.slice(edit.end);
        }
        chunk.code = next;
      }
    },
  };
}

/**
 * The modules whose functions reach the page as their own source text: the
 * stream's swap, and seroval's helpers inside every seed. Built minified, with
 * that text frozen into string literals, and reached through the package's
 * `#swap` and `#serializer` imports. `wire-text.test.ts` builds this same
 * config and runs what it produces.
 */
export const wireText: UserConfig = {
  entry: ["./src/swap.ts", "./src/serializer.ts"],
  format: ["esm"],
  outExtensions,
  dts: false,
  clean: true,
  minify: true,
  deps: { alwaysBundle: ["seroval"] },
  plugins: [freezeFunctionText()],
};
