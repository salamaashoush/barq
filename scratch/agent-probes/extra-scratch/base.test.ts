import { test, expect } from "bun:test";
import { Router, Link } from "../src/router.ts";
import { scope, flush } from "@barqjs/core";

test("base double-prefix?", async () => {
  window.history.replaceState(null, "", "/app/users");
  const seen: string[] = [];
  const routes = [
    { path: "/users", component: (_s: any) => { seen.push("users"); return document.createTextNode("u"); } },
    { path: "/posts", component: (_s: any) => { seen.push("posts"); return document.createTextNode("p"); } },
  ];
  let dispose!: () => void;
  const host = document.createElement("div");
  document.body.appendChild(host);
  scope((d) => {
    dispose = d;
    const node = Router(undefined as any, { base: "/app", routes, children: () => null } as any);
    if (node) host.appendChild(node as any);
  }, false);
  flush();
  console.log("initial pathname:", window.location.pathname, "matched:", seen);

  // programmatic nav via a hand-written <a href>
  const a = document.createElement("a");
  a.setAttribute("href", "/posts");
  host.appendChild(a);
  a.click();
  await new Promise(r => setTimeout(r, 50));
  flush();
  console.log("after click href=/posts  ->", window.location.pathname, "matched:", seen);

  const b = document.createElement("a");
  b.setAttribute("href", "/app/users");
  host.appendChild(b);
  b.click();
  await new Promise(r => setTimeout(r, 50));
  flush();
  console.log("after click href=/app/users ->", window.location.pathname, "matched:", seen);
  dispose();
});
