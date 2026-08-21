import { createRequire } from "node:module";
const native = createRequire(import.meta.url)("@barqjs/compiler-rs") as {
  transform(code: string, options?: Record<string, unknown>): {
    code: string;
    warnings: string[];
    diagnostics?: { code: string; message: string }[];
  };
};

const source = `import { Link } from "@barqjs/router";
export const Nav = () => <div><Link to="/demo/dashboard/adminn">bad</Link><Link to="/demo/dashboard/admin">good</Link></div>;
`;

for (const routes of [undefined, ["/demo/dashboard/admin", "/"]]) {
  const out = native.transform(source, {
    filename: "/x/Nav.tsx",
    ...(routes === undefined ? {} : { routes }),
  });
  console.log(
    `routes=${routes === undefined ? "absent" : JSON.stringify(routes)}`,
    "\n  warnings:",
    JSON.stringify(out.warnings),
    "\n  diagnostics:",
    JSON.stringify((out.diagnostics ?? []).map((d) => `${d.code}: ${d.message}`)),
  );
}
