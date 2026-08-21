import { transform } from "../index.js";

const route = `
import { getUser } from "./users.ts";
export default function UserPage(props) {
  return <div>{getUser}</div>;
}
`;
const out = transform(route, { filename: "/app/routes/user.tsx", root: "/app", env: "client" });
console.log("=== ROUTE, env=client ===");
console.log(out.code);
