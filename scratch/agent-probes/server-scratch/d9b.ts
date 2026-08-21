import { computed, scope } from "../../core/src/signals.ts";
import { getHydrationData, clearHydrationData, setAsyncSession, settle } from "../../core/src/signals.ts";

console.log("=== D9.3 null-bucket cross-session leak ===");
// Render A's loader started OUTSIDE an async session (activeAsyncSession === null)
let dispA!: () => void;
scope((d) => {
  dispA = d;
  const c = computed(async () => { await new Promise(r => setTimeout(r, 5)); return "RENDER-A-SECRET-user7"; }, { key: "r:/account|{}" });
  try { c(); } catch {}
}, true);
await new Promise((r) => setTimeout(r, 40));

// Now render B, in its OWN session, for a DIFFERENT user.
const sessionB = Symbol("B");
const prev = setAsyncSession(sessionB);
let dispB!: () => void;
scope((d) => {
  dispB = d;
  const c = computed(async () => { await new Promise(r => setTimeout(r, 5)); return "B-own-user9"; }, { key: "r:/home|{}" });
  try { c(); } catch {}
}, true);
await settle(sessionB);
setAsyncSession(prev);

const dataB = getHydrationData(sessionB);
console.log("  render B seed:", JSON.stringify(dataB));
console.log("  >>> LEAK of render A's value into B's seed:", JSON.stringify(dataB).includes("RENDER-A-SECRET"));
clearHydrationData(sessionB);
const still = getHydrationData(Symbol("C"));
console.log("  after clearHydrationData(B), a THIRD session still sees:", JSON.stringify(still));
