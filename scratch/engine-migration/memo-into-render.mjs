// Move an async memo declared at the top of a test body into the function that
// reads it, which is where a component would declare it.
//
//   bun scratch/engine-migration/memo-into-render.mjs [--dry] <file...>
//
// A memo is computed where it is declared. One declared outside the render is
// computed outside the render's session, so the render never waits for it.
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { parse } = require(
  new URL("../../node_modules/.bun/@babel+parser@8.0.4/node_modules/@babel/parser", import.meta.url)
    .pathname,
);

const dry = process.argv.includes("--dry");
const files = process.argv.slice(2).filter((a) => !a.startsWith("--"));

function walk(node, visit, parent = null) {
  if (node === null || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit, parent);
    return;
  }
  if (typeof node.type !== "string") return;
  if (visit(node, parent) === false) return;
  for (const key of Object.keys(node)) {
    if (key === "loc" || key === "start" || key === "end" || key === "range") continue;
    walk(node[key], visit, node);
  }
}

const isFn = (n) =>
  n.type === "ArrowFunctionExpression" || n.type === "FunctionExpression" || n.type === "FunctionDeclaration";

function refs(node, names) {
  const hit = new Set();
  walk(node, (n) => {
    if (n.type === "Identifier" && names.has(n.name)) hit.add(n.name);
  });
  return hit;
}

for (const file of files) {
  const source = readFileSync(file, "utf8");
  const plugins = file.endsWith("x") ? ["typescript", "jsx"] : ["typescript"];
  const ast = parse(source, { sourceType: "module", plugins });
  const edits = [];
  const notes = [];
  const moved = new Map();

  // The memo a declaration makes, or null. `runWithOwner(null, () => createMemo(..))`
  // was how a memo was kept alive outside a render, and is the same thing here.
  const memoOf = (stmt) => {
    if (stmt.type !== "VariableDeclaration" || stmt.declarations.length !== 1) return null;
    const decl = stmt.declarations[0];
    if (decl.id.type !== "Identifier" || decl.init?.type !== "CallExpression") return null;
    let call = decl.init;
    if (
      call.callee.type === "Identifier" &&
      call.callee.name === "runWithOwner" &&
      call.arguments[0]?.type === "NullLiteral" &&
      isFn(call.arguments[1] ?? {}) &&
      call.arguments[1].body.type === "CallExpression"
    ) {
      call = call.arguments[1].body;
    }
    if (call.callee.type !== "Identifier" || call.callee.name !== "createMemo") return null;
    return { name: decl.id.name, call };
  };

  // Only a function that runs BEFORE the render: a test body, or a factory
  // that returns the page. A memo already declared by the page stays there,
  // because one level further in is the boundary's own closure, and a memo
  // declared there dies each time the boundary parks.
  const FACTORY = /^(make|build|pageThat)/;
  walk(ast.program, (node, parent) => {
    if (!isFn(node) || node.body.type !== "BlockStatement") return;
    const harness =
      parent?.type === "CallExpression" &&
      /^(test|it|describe)$/.test(parent.callee.name ?? parent.callee.property?.name ?? "");
    const factory = parent?.type === "VariableDeclarator" && FACTORY.test(parent.id.name ?? "");
    if (!harness && !factory) return;
    const body = node.body.body;
    const homeOf = new Map();

    // Last first: a memo read by a later memo goes wherever that one went.
    for (let i = body.length - 1; i >= 0; i--) {
      const stmt = body[i];
      const memo = memoOf(stmt);
      if (memo === null) continue;
      const names = new Set([memo.name]);
      const homes = new Set();
      let bare = false;
      for (let j = i + 1; j < body.length; j++) {
        const later = body[j];
        if (refs(later, names).size === 0) continue;
        if (homeOf.has(later)) {
          homes.add(homeOf.get(later));
          continue;
        }
        let found = null;
        walk(later, (n) => {
          if (found !== null) return false;
          if (isFn(n) && refs(n, names).size > 0) {
            found = n;
            return false;
          }
        });
        // A reference that sits outside the function found is a bare read.
        if (found === null) bare = true;
        else {
          let outside = false;
          walk(later, (n) => {
            if (n === found) return false;
            if (n.type === "Identifier" && n.name === memo.name) outside = true;
          });
          if (outside) bare = true;
          homes.add(found);
        }
      }
      const line = source.slice(0, stmt.start).split("\n").length;
      if (bare || homes.size !== 1) {
        notes.push(
          `  left ${memo.name} at ${line}: ${bare ? "read outside a function" : `${homes.size} readers`}`,
        );
        continue;
      }
      const [home] = homes;
      homeOf.set(stmt, home);
      const text = `const ${memo.name} = ${source.slice(memo.call.start, memo.call.end)};`;
      let cut = stmt.end;
      while (source[cut] === " ") cut++;
      if (source[cut] === "\n") cut++;
      let from = stmt.start;
      while (from > 0 && source[from - 1] === " ") from--;
      edits.push({ start: from, end: cut, text: "" });
      const list = moved.get(home);
      if (list === undefined) moved.set(home, [text]);
      else list.unshift(text);
    }
  });

  for (const [home, texts] of moved) {
    const decls = texts.join("\n");
    if (home.body.type === "BlockStatement") {
      edits.push({ start: home.body.start + 1, end: home.body.start + 1, text: `\n${decls}` });
      continue;
    }
    // Parenthesised object bodies keep their own parentheses.
    let open = home.body.start;
    let close = home.body.end;
    const before = source.slice(0, open);
    const paren = /\(\s*$/.exec(before);
    const arrow = before.lastIndexOf("=>");
    if (paren !== null && paren.index > arrow) {
      open = paren.index;
      close = source.indexOf(")", close) + 1;
    }
    edits.push({ start: open, end: open, text: `{\n${decls}\nreturn ` });
    edits.push({ start: close, end: close, text: `;\n}` });
  }

  if (edits.length === 0) {
    if (notes.length > 0) console.log(`${file}\n${notes.join("\n")}`);
    continue;
  }
  edits.sort((a, b) => b.start - a.start);
  let out = source;
  for (const edit of edits) out = out.slice(0, edit.start) + edit.text + out.slice(edit.end);
  console.log(`${file}: ${edits.filter((e) => e.text === "").length} moved`);
  if (notes.length > 0) console.log(notes.join("\n"));
  if (!dry) writeFileSync(file, out);
}
