import { describe, expect, test } from "bun:test";
import { createMemo, createRoot, flush } from "@barqjs/core";

import {
  VirtualFsError,
  type VirtualFsTree,
  isValidName,
  joinPath,
  nameOf,
  parentOf,
  virtualFs,
} from "./virtual-fs.ts";

function code(run: () => void): string | undefined {
  try {
    run();
    return undefined;
  } catch (error) {
    return error instanceof VirtualFsError ? error.code : String(error);
  }
}

describe("virtualFs", () => {
  test("lists folders first, then names with numbers in order", () => {
    const fs = virtualFs({
      "b10.txt": "",
      "b2.txt": "",
      src: { "main.txt": "print 1" },
      "A.md": "",
      lib: {},
    });
    expect(fs.list().map((one) => one.name)).toEqual(["lib", "src", "A.md", "b2.txt", "b10.txt"]);
    expect(fs.list("src")).toEqual([
      { path: "src/main.txt", name: "main.txt", parent: "src", kind: "file" },
    ]);
    expect(fs.files()).toEqual(["src/main.txt", "A.md", "b2.txt", "b10.txt"]);
    expect(fs.list("missing")).toEqual([]);
  });

  test("writes make the folders above them and read back at once", () => {
    const fs = virtualFs();
    fs.write("a/b/c.txt", "one");
    expect(fs.read("a/b/c.txt")).toBe("one");
    expect(fs.entry("a/b")?.kind).toBe("folder");
    fs.write("/a//b/c.txt", "two");
    expect(fs.read("a/b/c.txt")).toBe("two");
    expect(fs.read("a")).toBeUndefined();
    expect(code(() => fs.write("a", "x"))).toBe("not-a-file");
    expect(code(() => fs.write("a/b/c.txt/d", "x"))).toBe("not-a-folder");
    expect(code(() => fs.write("a/../x", "x"))).toBe("invalid-name");
  });

  test("moves and renames carry a folder's contents", () => {
    const fs = virtualFs({ src: { "a.txt": "a", deep: { "b.txt": "b" } }, "c.txt": "c" });
    fs.move("src", "lib/src");
    expect(fs.files()).toEqual(["lib/src/deep/b.txt", "lib/src/a.txt", "c.txt"]);
    expect(fs.rename("lib/src/a.txt", "z.txt")).toBe("lib/src/z.txt");
    expect(fs.read("lib/src/z.txt")).toBe("a");
    expect(code(() => fs.move("lib", "lib/src/inner"))).toBe("into-itself");
    expect(code(() => fs.move("c.txt", "lib/src/z.txt"))).toBe("exists");
    expect(code(() => fs.move("nope", "x"))).toBe("missing");
    expect(code(() => fs.rename("c.txt", "a/b"))).toBe("invalid-name");
  });

  test("removes a folder with everything in it", () => {
    const fs = virtualFs({ src: { "a.txt": "a", deep: { "b.txt": "b" } }, "src2.txt": "" });
    fs.remove("src");
    expect(fs.files()).toEqual(["src2.txt"]);
    expect(code(() => fs.remove("src"))).toBe("missing");
  });

  test("round-trips through a plain object and JSON", () => {
    const tree = { src: { "main.txt": "print 1", empty: {} }, "notes.md": "# Notes" };
    const fs = virtualFs(tree);
    const again = virtualFs(JSON.parse(JSON.stringify(fs.toJSON())) as VirtualFsTree);
    expect(again.toJSON()).toEqual(tree);
    again.load({ "only.txt": "1" });
    expect(again.files()).toEqual(["only.txt"]);
    expect(code(() => again.load({ "a/b": "x" }))).toBe("invalid-name");
    expect(again.files()).toEqual(["only.txt"]);
  });

  test("reads in a memo follow changes", () => {
    const fs = virtualFs({ "a.txt": "1" });
    const seen: string[] = [];
    const dispose = createRoot((done) => {
      const names = createMemo(() =>
        fs
          .list()
          .map((one) => one.name)
          .join(","),
      );
      const content = createMemo(() => fs.read("a.txt") ?? "");
      seen.push(`${names()}|${content()}`);
      return () => {
        seen.push(`${names()}|${content()}`);
        done();
      };
    });
    fs.write("b.txt", "");
    fs.write("a.txt", "2");
    flush();
    dispose();
    expect(seen).toEqual(["a.txt|1", "a.txt,b.txt|2"]);
  });

  test("tells listeners about each change", () => {
    const fs = virtualFs();
    const heard: string[] = [];
    const stop = fs.onChange((change) =>
      heard.push(`${change.kind}:${change.path}${change.to === undefined ? "" : `>${change.to}`}`),
    );
    fs.write("a.txt", "");
    fs.write("a.txt", "x");
    fs.write("a.txt", "x");
    fs.mkdir("dir");
    fs.move("a.txt", "dir/a.txt");
    fs.remove("dir");
    stop();
    fs.write("b.txt", "");
    expect(heard).toEqual([
      "create:a.txt",
      "write:a.txt",
      "create:dir",
      "move:a.txt>dir/a.txt",
      "remove:dir",
    ]);
  });

  test("path helpers", () => {
    expect(parentOf("a/b/c")).toBe("a/b");
    expect(parentOf("c")).toBe("");
    expect(nameOf("a/b/c")).toBe("c");
    expect(joinPath("a/", "/b", "", "c")).toBe("a/b/c");
    expect(isValidName("ok.txt")).toBe(true);
    expect(isValidName("..")).toBe(false);
    expect(isValidName("a/b")).toBe(false);
    expect(isValidName("  ")).toBe(false);
  });
});
