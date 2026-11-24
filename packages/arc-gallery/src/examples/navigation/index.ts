import type { Demos } from "../../gallery/types.ts";
import BreadcrumbTrails from "./breadcrumbs.tsx";
import breadcrumbs from "./breadcrumbs.tsx?raw";
import NavigationMenus from "./menus.tsx";
import menus from "./menus.tsx?raw";
import Pagers from "./pager.tsx";
import pager from "./pager.tsx?raw";
import SideNavigation from "./side-nav.tsx";
import sideNav from "./side-nav.tsx?raw";
import Steppers from "./stepper.tsx";
import stepper from "./stepper.tsx?raw";
import Contents from "./table-of-contents.tsx";
import tableOfContents from "./table-of-contents.tsx?raw";
import TabSets from "./tabs.tsx";
import tabs from "./tabs.tsx?raw";
import UnsavedChanges from "./unsaved.tsx";
import unsaved from "./unsaved.tsx?raw";

export const demos: Demos = {
  breadcrumbs: { component: BreadcrumbTrails, code: breadcrumbs },
  tabs: { component: TabSets, code: tabs },
  stepper: { component: Steppers, code: stepper },
  pager: { component: Pagers, code: pager },
  "table-of-contents": { component: Contents, code: tableOfContents },
  "side-nav": { component: SideNavigation, code: sideNav },
  menus: { component: NavigationMenus, code: menus },
  unsaved: { component: UnsavedChanges, code: unsaved },
};
