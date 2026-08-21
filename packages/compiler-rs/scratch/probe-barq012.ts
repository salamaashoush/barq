import { transform } from "../index.js";
const code = `
import { createServerFn } from "@barqjs/start";
export const loader = createServerFn().handler(async () => 1);
export default function Users(props) { return <ul>{props.x}</ul>; }
`;
const out = transform(code, { filename: "/app/routes/users.tsx", root: "/app", env: "client", serverFns: true });
console.log(JSON.stringify(out.warnings, null, 2));
console.log("--- emitted code ---");
console.log(out.code);
