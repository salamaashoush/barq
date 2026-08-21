import { createRequire } from "node:module";

import { describe, expect, test } from "bun:test";

import { type RouteFile, buildTree, generateModule, generateTypes, nameOf } from "./generate.ts";
import { createMatcher } from "./matcher.ts";
import { type RouteDefinition, flattenRoutes } from "./route.ts";

const files = (...names: string[]): RouteFile[] =>
  names.map((file) => ({ file: `src/routes/${file}`, name: nameOf(file) }));

describe("nameOf", () => {
  test("drops the extension and treats a directory as a dot", () => {
    expect(nameOf("users.$id.tsx")).toBe("users.$id");
    expect(nameOf("users/$id.tsx")).toBe("users.$id");
    expect(nameOf("index.jsx")).toBe("index");
  });
});

describe("buildTree", () => {
  test("flat files become flat routes", () => {
    const tree = buildTree(files("index.tsx", "about.tsx", "users.$id.tsx"));
    expect(tree.map((node) => ({ id: node.id, path: node.path }))).toEqual([
      // A root index names the root, and its id is `/` rather than `/index`.
      { id: "/", path: "/" },
      { id: "/about", path: "about" },
      { id: "/users/$id", path: "users/$id" },
    ]);
  });

  test("a `.route` file becomes the layout its siblings nest under", () => {
    const tree = buildTree(files("users.route.tsx", "users.index.tsx", "users.$id.tsx"));
    expect(tree).toHaveLength(1);
    expect(tree[0]?.path).toBe("users");
    expect(tree[0]?.children.map((c) => ({ id: c.id, path: c.path }))).toEqual([
      // TanStack's convention: the index of `/users` is `/users/`, which does
      // not collide with the layout's own `/users`.
      { id: "/users/", path: "" },
      { id: "/users/$id", path: "$id" },
    ]);
  });

  test("a prefix nobody declares stays flat — there is no invisible layout", () => {
    const tree = buildTree(files("users.index.tsx", "users.$id.tsx"));
    expect(tree.map((n) => n.id)).toEqual(["/users/", "/users/$id"]);
    expect(tree.every((n) => n.children.length === 0)).toBe(true);
  });

  test("a leading underscore is a pathless layout", () => {
    const tree = buildTree(files("_shell.route.tsx", "_shell.dashboard.tsx"));
    expect(tree[0]?.pathless).toBe(true);
    expect(tree[0]?.path).toBeUndefined();
    expect(tree[0]?.children[0]?.path).toBe("dashboard");
  });

  test("nested layouts compose, and a child's path is relative to its parent", () => {
    const tree = buildTree(files("users.route.tsx", "users.$id.route.tsx", "users.$id.edit.tsx"));
    const users = tree[0];
    expect(users?.path).toBe("users");
    const user = users?.children[0];
    expect(user?.path).toBe("$id");
    expect(user?.children[0]?.path).toBe("edit");
  });
});

describe("the generated table matches the same URLs a hand-written one would", () => {
  test("end to end, through the real matcher", () => {
    // The generator's whole job is to emit into the runtime that already
    // exists, so the check is that its output MATCHES, not that it looks right.
    const tree = buildTree(
      files("index.tsx", "users.route.tsx", "users.index.tsx", "users.$id.tsx", "files.$.tsx"),
    );

    // Mirror the emitted shape as data, since the emitted module imports files
    // that do not exist in a test.
    const toDefinition = (node: (typeof tree)[number]): RouteDefinition<never, never> =>
      ({
        path: node.path,
        id: node.id,
        component: (() => null) as never,
        children: node.children.length > 0 ? node.children.map(toDefinition) : undefined,
      }) as RouteDefinition<never, never>;

    const matcher = createMatcher(flattenRoutes(tree.map(toDefinition)));

    expect(matcher.match("/")?.route.id).toBe("/");
    expect(matcher.match("/users")?.route.id).toBe("/users/");
    expect(matcher.match("/users/7")).toMatchObject({
      route: { id: "/users/$id" },
      params: { id: "7" },
    });
    expect(matcher.match("/files/a/b")).toMatchObject({ params: { _splat: "a/b" } });
    expect(matcher.match("/nope")).toBeNull();
  });
});

describe("generateModule", () => {
  test("imports nothing eagerly — every route is its own chunk", () => {
    const source = generateModule(buildTree(files("users.$id.tsx")), "@barqjs/router");
    // One static import, and it is the runtime's.
    const statics = [...source.matchAll(/^import .* from/gm)];
    expect(statics).toHaveLength(1);
    expect(source).toContain('import { lazy } from "@barqjs/core"');
    expect(source).toContain('lazy(() => import("/src/routes/users.$id.tsx"))');
  });

  test("parses — through the real parser, not a regex", () => {
    // A generated module nothing parses is exactly how `export const default =`
    // — a syntax error — shipped in the compiler's client stubs. So this runs
    // the actual compiler over it rather than approximating a parse.
    const source = generateModule(
      buildTree(
        files(
          "index.tsx",
          "users.route.tsx",
          "users.index.tsx",
          "users.$id.tsx",
          "files.$.tsx",
          "_shell.route.tsx",
        ),
      ),
      "@barqjs/router",
    );
    const native = createRequire(import.meta.url)("@barqjs/compiler-rs") as {
      transform(code: string, options?: Record<string, unknown>): { code: string };
    };
    expect(() => native.transform(source, { filename: "routes.gen.js" })).not.toThrow();
  });
});

describe("generateTypes", () => {
  test("one plain interface member per LEAF route, with its params", () => {
    const types = generateTypes(
      buildTree(files("index.tsx", "users.route.tsx", "users.$id.tsx", "files.$.tsx")),
    );
    expect(types).toContain('"/users/$id": { path: "/users/$id"; params: { id: string } }');
    expect(types).toContain('"_splat": string');
    // A layout is not addressable on its own, so it is not a member.
    expect(types).not.toContain('"/users": {');
    expect(types).toContain('declare module "virtual:barq-routes"');
  });
});
