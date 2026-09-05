import { Dashboard01 } from "./dashboard-01.tsx";
import { Login04 } from "./login-04.tsx";
import { Sidebar07 } from "./sidebar-07.tsx";

import type { Child } from "@barqjs/core";

export interface BlockEntry {
  /** shadcn's own registry name, which is the address the block lives at. */
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly categories: readonly string[];
  readonly component: () => Child;
}

/**
 * The blocks, by the name upstream's registry gives them.
 *
 * The name is the URL, so `/blocks/dashboard-01` opens the block anyone would
 * go looking for rather than a number that means nothing off this page.
 */
export const BLOCKS: readonly BlockEntry[] = [
  {
    name: "dashboard-01",
    title: "Dashboard 01",
    description: "A dashboard with a sidebar, charts and a data table.",
    categories: ["dashboard"],
    component: Dashboard01,
  },
  {
    name: "sidebar-07",
    title: "Sidebar 07",
    description: "A sidebar that collapses to icons, with a team switcher.",
    categories: ["sidebar"],
    component: Sidebar07,
  },
  {
    name: "login-04",
    title: "Login 04",
    description: "A login page with an image and a separated provider row.",
    categories: ["authentication", "login"],
    component: Login04,
  },
];

export function blockNamed(name: string): BlockEntry | undefined {
  return BLOCKS.find((block) => block.name === name);
}
