/**
 * The suite's property oracles refuse an id their registry does not name, and
 * upstream's registry names its own framework drivers. A first-party adapter
 * adds its ids to `oracle-config.ts`; this one adds them here, the same list
 * under the same configuration, before any oracle reads it.
 */

import { configureOracles } from "@tanstack/oracles";
import { registeredOracleProperties } from "@tanstack-db-tests/oracle-config";

// Every property family the shared registrations take a driver's name into.
const FAMILIES = [
  "result-shape",
  "window-history-fixed",
  "window-history",
  "pending-window-history",
  "publication-window-history",
  "peer-window-history",
  "keyed-admission",
  "immutable-key-history",
] as const;

export function registerDriver(name: string): void {
  configureOracles({
    envPrefix: "TANSTACK_DB_ORACLE",
    registry: [
      ...registeredOracleProperties,
      ...FAMILIES.map((family) => `framework.${name}.${family}`),
    ],
  });
}
