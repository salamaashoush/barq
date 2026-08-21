import { transform } from "../index.js";
const out = transform(`
import { createServerFn } from "@barqjs/start";
export const loader = createServerFn().handler(async () => 1);
export function Page(_s, props) { return <div/>; }
`, { filename: "/app/routes/u.tsx", root: "/app", env: "client", serverFns: true });
console.log(JSON.stringify(out.warnings, null, 2));
