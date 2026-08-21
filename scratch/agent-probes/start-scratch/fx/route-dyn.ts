export const path = "/dyn";
export async function load() {
  const m = await import("./users.data.ts");
  return m.loadAdmin(undefined);
}
