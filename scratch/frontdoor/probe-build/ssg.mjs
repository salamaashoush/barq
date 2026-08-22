// In-process SSG, exactly as the design proposes: import the built server bundle
// in the same Node process that ran the build, and call its fetch.
const mod = await import(new URL("./dist-shared/server/server.js", import.meta.url).href);
console.log("exports:", Object.keys(mod));
const res = await mod.default.fetch(new Request("http://localhost/users/7"));
console.log("status:", res.status);
const html = await res.text();
console.log("html:", html.slice(0, 800));
