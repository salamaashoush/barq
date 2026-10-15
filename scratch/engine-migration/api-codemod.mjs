// Rewrite barq's old reactive names to Solid 2.0's, by AST position.
//
//   bun scratch/engine-migration/api-codemod.mjs [--dry] <file...>
//
// `const x = signal(0)` becomes `const [x, setX] = createSignal(0)`, and every
// `x.set(..)` / `x.update(..)` / `x.peek()` in reach of that declaration is
// rewritten with it. Anything the rewrite cannot decide is left as it was and
// printed, so the type checker has the last word.
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { parse } = require(
  new URL("../../node_modules/.bun/@babel+parser@8.0.4/node_modules/@babel/parser", import.meta.url)
    .pathname,
);

const CORE = /^(@barqjs\/core|\.\.?\/(index|signals|store|map|boundaries|actions|scope)\.ts)$/;
const GONE = /^\.\.?\/(store|map|boundaries|actions)\.ts$/;

const RENAME = {
  __proto__: null,
  signal: "createSignal",
  computed: "createMemo",
  renderEffect: "createRenderEffect",
  scope: "createRoot",
  root: "createRoot",
  batch: "flush",
  onMount: "onSettled",
  context: "createContext",
  store: "createStore",
  optimistic: "createOptimistic",
  optimisticStore: "createOptimisticStore",
  projection: "createProjection",
  trackedEffect: "createTrackedEffect",
  reaction: "createReaction",
  owner: "createOwner",
  errorBoundary: "createErrorBoundary",
  loadingBoundary: "createLoadingBoundary",
  revealOrder: "createRevealOrder",
  unwrap: "snapshot",
  linked: "createSignal",
  Computed: "Accessor",
};

const dry = process.argv.includes("--dry");
const files = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));

function walk(node, visit, parent = null, key = null) {
  if (node === null || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit, parent, key);
    return;
  }
  if (typeof node.type !== "string") return;
  visit(node, parent, key);
  for (const name in node) {
    if (name === "loc" || name === "start" || name === "end" || name === "extra") continue;
    const child = node[name];
    if (child !== null && typeof child === "object") walk(child, visit, node, name);
  }
}

const capital = (name) => name[0].toUpperCase() + name.slice(1);

function transform(path) {
  const source = readFileSync(path, "utf8");
  let ast;
  try {
    ast = parse(source, {
      sourceType: "module",
      plugins: ["typescript", "jsx"],
      errorRecovery: true,
    });
  } catch (error) {
    console.log(`  ! parse failed: ${path}: ${error.message}`);
    return;
  }

  /** local name -> imported name, for bindings that came from core */
  const local = new Map();
  const imports = [];
  for (const statement of ast.program.body) {
    if (statement.type !== "ImportDeclaration" || !CORE.test(statement.source.value)) continue;
    imports.push(statement);
    for (const spec of statement.specifiers) {
      if (spec.type !== "ImportSpecifier") continue;
      local.set(spec.local.name, spec.imported.name ?? spec.imported.value);
    }
  }
  if (imports.length === 0) return;

  const bound = new Set();
  walk(ast, (node) => {
    if (node.type === "Identifier") bound.add(node.name);
  });

  const edits = [];
  const need = new Set();
  const notes = [];
  const edit = (start, end, text) => edits.push({ start, end, text });
  const text = (node) => source.slice(node.start, node.end);
  const from = (name) => local.get(name);

  // The innermost function or program enclosing each node, by position.
  const scopes = [];
  walk(ast, (node) => {
    if (
      node.type === "Program" ||
      node.type === "FunctionDeclaration" ||
      node.type === "FunctionExpression" ||
      node.type === "ArrowFunctionExpression" ||
      node.type === "ObjectMethod" ||
      node.type === "ClassMethod"
    ) {
      scopes.push(node);
    }
  });
  const scopeOf = (node) => {
    let best = ast.program;
    for (const scope of scopes) {
      if (scope.start <= node.start && node.end <= scope.end) {
        if (scope.end - scope.start < best.end - best.start) best = scope;
      }
    }
    return best;
  };

  /** name -> [{ scope, setter, kind }] */
  const declared = new Map();
  const declare = (name, entry) => {
    if (!declared.has(name)) declared.set(name, []);
    declared.get(name).push(entry);
  };
  const lookup = (identifier) => {
    const entries = declared.get(identifier.name);
    if (entries === undefined) return null;
    let best = null;
    for (const entry of entries) {
      if (entry.scope.start <= identifier.start && identifier.end <= entry.scope.end) {
        if (best === null || entry.scope.end - entry.scope.start < best.scope.end - best.scope.start) {
          best = entry;
        }
      }
    }
    return best;
  };

  const signals = [];

  // Pass 1: declarations.
  walk(ast, (node) => {
    if (node.type !== "VariableDeclarator" || node.init === null) return;
    const init = node.init;
    if (init.type !== "CallExpression" || init.callee.type !== "Identifier") return;
    const imported = from(init.callee.name);
    if (node.id.type !== "Identifier") return;
    const name = node.id.name;
    if (imported === "signal" || imported === "optimistic" || imported === "linked") {
      // Two signals of one name in two scopes get the same setter name, which
      // is what a person would write; only a name the file already uses for
      // something else is avoided.
      let setter = `set${capital(name)}`;
      if (bound.has(setter)) setter = `write${capital(name)}`;
      const entry = { scope: scopeOf(node), setter, kind: "signal", used: false, id: node.id };
      declare(name, entry);
      signals.push(entry);
      if (imported === "linked") notes.push(`linked() at ${node.loc.start.line}: fold source and compute into one function`);
    } else if (imported === "computed") {
      declare(name, { scope: scopeOf(node), setter: null, kind: "memo" });
    }
  });

  // Pass 2: uses.
  walk(ast, (node, parent, key) => {
    if (node.type === "CallExpression" && node.callee.type === "Identifier") {
      const imported = from(node.callee.name);
      if (imported === "effect") {
        const single = node.arguments.length === 1;
        const used =
          parent !== null &&
          parent.type !== "ExpressionStatement" &&
          !(parent.type === "ArrowFunctionExpression" && key === "body");
        const target = single ? "createTrackedEffect" : "createEffect";
        need.add(target);
        if (used) {
          need.add("createRoot");
          edit(node.start, node.callee.end, `createRoot((dispose) => {\n${target}`);
          edit(node.end, node.end, `;\nreturn dispose;\n})`);
        } else {
          edit(node.callee.start, node.callee.end, target);
        }
        return;
      }
      if (imported === "renderEffect" && node.arguments.length === 1) {
        edit(node.arguments[0].end, node.arguments[0].end, ", () => {}");
      }
      if ((imported === "scope" || imported === "root") && node.arguments.length === 2) {
        const flag = node.arguments[1];
        if (flag.type === "BooleanLiteral" && flag.value === true) {
          need.add("runWithOwner");
          edit(node.start, node.start, "runWithOwner(null, () => ");
          edit(node.arguments[0].end, flag.end, "");
          edit(node.end, node.end, ")");
        } else {
          notes.push(`scope(fn, ${text(flag)}) at ${node.loc.start.line}`);
        }
      }
      if (imported === "isTracking") {
        need.add("getObserver");
        edit(node.start, node.end, "(getObserver() !== null)");
      }
      return;
    }

    if (node.type === "MemberExpression" && !node.computed && node.object.type === "Identifier") {
      const entry = lookup(node.object);
      if (entry === null) return;
      const method = node.property.name;
      const called = parent !== null && parent.type === "CallExpression" && key === "callee";
      if (entry.kind === "signal" && (method === "set" || method === "update")) {
        entry.used = true;
        edit(node.start, node.end, entry.setter);
      } else if (method === "peek") {
        need.add("untrack");
        if (called) edit(parent.start, parent.end, `untrack(${node.object.name})`);
        else edit(node.start, node.end, `(() => untrack(${node.object.name}))`);
      }
      return;
    }

    // `bind:value={name}` takes the pair.
    if (
      node.type === "JSXAttribute" &&
      node.name.type === "JSXNamespacedName" &&
      node.name.namespace.name === "bind" &&
      node.value !== null &&
      node.value.type === "JSXExpressionContainer" &&
      node.value.expression.type === "Identifier"
    ) {
      const entry = lookup(node.value.expression);
      if (entry !== null && entry.kind === "signal") {
        entry.used = true;
        const id = node.value.expression;
        edit(id.start, id.end, `[${id.name}, ${entry.setter}]`);
      }
    }
  });

  // The annotation, if any, described the old callable shape, so the whole
  // binding is replaced. A setter nothing calls is not declared.
  for (const entry of signals) {
    const name = entry.id.name;
    edit(entry.id.start, entry.id.end, entry.used ? `[${name}, ${entry.setter}]` : `[${name}]`);
  }

  // Pass 3: every remaining reference to a renamed import.
  const renamedLocals = new Map();
  for (const [name, imported] of local) {
    if (imported === "effect" || imported === "isTracking") continue;
    const next = RENAME[imported];
    if (next !== undefined && name === imported) renamedLocals.set(name, next);
  }
  walk(ast, (node, parent, key) => {
    if (node.type !== "Identifier" && node.type !== "JSXIdentifier") return;
    const next = renamedLocals.get(node.name);
    if (next === undefined) return;
    if (parent === null) return;
    if (parent.type === "ImportSpecifier") return;
    if (parent.type === "MemberExpression" && key === "property" && !parent.computed) return;
    if ((parent.type === "ObjectProperty" || parent.type === "ObjectMethod") && key === "key" && !parent.computed) {
      if (parent.shorthand) edit(node.start, node.end, `${node.name}: ${next}`);
      return;
    }
    if (parent.type === "TSPropertySignature" || parent.type === "TSMethodSignature") return;
    if (parent.type === "JSXAttribute" || parent.type === "JSXNamespacedName") return;
    if (parent.type === "VariableDeclarator" && key === "id") return;
    if (key === "params") return;
    // A local of the same name shadows the import: leave it alone.
    edit(node.start, node.end, next);
  });

  // Imports: rename, de-duplicate, add what the rewrite introduced.
  const have = new Set();
  // What is imported under a name the rewrite also produces is already there.
  for (const statement of imports) {
    for (const spec of statement.specifiers) {
      if (spec.type !== "ImportSpecifier") continue;
      const imported = spec.imported.name ?? spec.imported.value;
      if (RENAME[imported] === undefined && imported !== "effect" && imported !== "isTracking") {
        have.add(spec.local.name);
      }
    }
  }
  for (const statement of imports) {
    for (const spec of statement.specifiers) {
      if (spec.type !== "ImportSpecifier") continue;
      const imported = spec.imported.name ?? spec.imported.value;
      let next = RENAME[imported];
      if (imported === "isTracking") next = "getObserver";
      if (imported === "effect") next = "createTrackedEffect";
      if (next === undefined) continue;
      const aliased = spec.local.name !== imported;
      const kind = spec.importKind === "type" ? "type " : "";
      const local = aliased ? ` as ${spec.local.name}` : "";
      const key = aliased ? spec.local.name : next;
      if (have.has(key)) {
        // Remove the specifier and its trailing comma.
        let end = spec.end;
        const rest = source.slice(end);
        const comma = rest.match(/^\s*,/);
        if (comma) end += comma[0].length;
        edit(spec.start, end, "");
      } else {
        have.add(key);
        edit(spec.start, spec.end, `${kind}${next}${local}`);
      }
    }
    if (GONE.test(statement.source.value)) {
      edit(statement.source.start, statement.source.end, JSON.stringify(statement.source.value.replace(GONE, (m) => m.replace(/(store|map|boundaries|actions)/, "signals"))));
    }
  }
  const missing = [...need].filter((name) => !have.has(name));
  if (missing.length > 0) {
    const target = imports.find((statement) => statement.importKind !== "type" && statement.specifiers.some((s) => s.type === "ImportSpecifier")) ?? imports[0];
    const last = target.specifiers[target.specifiers.length - 1];
    edit(last.end, last.end, `, ${missing.join(", ")}`);
  }

  if (edits.length === 0) return;
  edits.sort((a, b) => b.start - a.start || b.end - a.end);
  let out = source;
  let floor = Infinity;
  for (const { start, end, text: replacement } of edits) {
    if (end > floor) {
      notes.push(`overlapping edit at offset ${start} skipped`);
      continue;
    }
    out = out.slice(0, start) + replacement + out.slice(end);
    floor = start;
  }
  if (!dry) writeFileSync(path, out);
  console.log(`${String(edits.length).padStart(4)} ${path}`);
  for (const note of notes) console.log(`     note: ${note}`);
}

for (const file of files) transform(file);
