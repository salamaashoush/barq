import { dep } from "./dep.js";
export const rpc = clientRpc("fn:abc123");
export const hi = dep;
function clientRpc(id) { return id; }
