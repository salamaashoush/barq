import { CATALOG, type BlockMeta, type BlockName } from "./catalog.ts";
import { Dashboard01 } from "./dashboard-01.tsx";
import { Login01 } from "./login-01.tsx";
import { Login02 } from "./login-02.tsx";
import { Login03 } from "./login-03.tsx";
import { Login04 } from "./login-04.tsx";
import { Login05 } from "./login-05.tsx";
import { Sidebar01 } from "./sidebar-01.tsx";
import { Sidebar02 } from "./sidebar-02.tsx";
import { Sidebar03 } from "./sidebar-03.tsx";
import { Sidebar04 } from "./sidebar-04.tsx";
import { Sidebar05 } from "./sidebar-05.tsx";
import { Sidebar06 } from "./sidebar-06.tsx";
import { Sidebar07 } from "./sidebar-07.tsx";
import { Sidebar08 } from "./sidebar-08.tsx";
import { Sidebar09 } from "./sidebar-09.tsx";
import { Sidebar10 } from "./sidebar-10.tsx";
import { Sidebar11 } from "./sidebar-11.tsx";
import { Sidebar12 } from "./sidebar-12.tsx";
import { Sidebar13 } from "./sidebar-13.tsx";
import { Sidebar14 } from "./sidebar-14.tsx";
import { Sidebar15 } from "./sidebar-15.tsx";
import { Sidebar16 } from "./sidebar-16.tsx";
import { Signup01 } from "./signup-01.tsx";
import { Signup02 } from "./signup-02.tsx";
import { Signup03 } from "./signup-03.tsx";
import { Signup04 } from "./signup-04.tsx";
import { Signup05 } from "./signup-05.tsx";

import type { Child } from "@barqjs/core";

export interface BlockEntry extends BlockMeta {
  readonly component: () => Child;
}

/** Keyed by `BlockName`, so a catalog entry with no component does not compile. */
const COMPONENTS: Record<BlockName, () => Child> = {
  "dashboard-01": Dashboard01,
  "sidebar-01": Sidebar01,
  "sidebar-02": Sidebar02,
  "sidebar-03": Sidebar03,
  "sidebar-04": Sidebar04,
  "sidebar-05": Sidebar05,
  "sidebar-06": Sidebar06,
  "sidebar-07": Sidebar07,
  "sidebar-08": Sidebar08,
  "sidebar-09": Sidebar09,
  "sidebar-10": Sidebar10,
  "sidebar-11": Sidebar11,
  "sidebar-12": Sidebar12,
  "sidebar-13": Sidebar13,
  "sidebar-14": Sidebar14,
  "sidebar-15": Sidebar15,
  "sidebar-16": Sidebar16,
  "login-01": Login01,
  "login-02": Login02,
  "login-03": Login03,
  "login-04": Login04,
  "login-05": Login05,
  "signup-01": Signup01,
  "signup-02": Signup02,
  "signup-03": Signup03,
  "signup-04": Signup04,
  "signup-05": Signup05,
};

/**
 * The blocks, by the name upstream's registry gives them.
 *
 * The name is the URL, so `/blocks/dashboard-01` opens the block anyone would
 * go looking for rather than a number that means nothing off this page.
 */
export const BLOCKS: readonly BlockEntry[] = CATALOG.map((block) => ({
  ...block,
  component: COMPONENTS[block.name],
}));

export function blockNamed(name: string): BlockEntry | undefined {
  return BLOCKS.find((block) => block.name === name);
}
