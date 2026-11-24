import type { GroupCatalog } from "../../gallery/types.ts";

export const catalog: GroupCatalog = {
  slug: "navigation",
  title: "Navigation",
  description:
    "The ways around an app: tabs, steppers, pagers, side navigation, breadcrumbs and a table of contents.",
  examples: [
    {
      id: "breadcrumbs",
      title: "Breadcrumbs",
      description:
        "A trail from the route's own crumbs or from data, its middle folded when it runs long.",
      covers: ["Breadcrumbs"],
    },
    {
      id: "tabs",
      title: "Tabs",
      description:
        "ui's tabs in both looks, and responsive tabs that move what does not fit into a menu.",
      covers: ["Tabs", "ResponsiveTabs"],
    },
    {
      id: "stepper",
      title: "Steppers",
      description:
        "Where a multi-step task is, which steps are done, optional or failing, across or down.",
      covers: ["Stepper"],
    },
    {
      id: "pager",
      title: "Pagers and pagination",
      description:
        "Pages with a size picker, compact and simple pagers, and ui's Pagination laid out by pageWindow.",
      covers: ["Pager", "pageWindow", "Pagination"],
    },
    {
      id: "table-of-contents",
      title: "Table of contents",
      description: "A long page's sections, the one being read marked as the page scrolls.",
      covers: ["TableOfContents"],
    },
    {
      id: "side-nav",
      title: "Side and bottom navigation",
      description: "A page's own navigation as AppShell data, and a phone's tab bar.",
      covers: ["SideNav", "BottomNavigation"],
    },
    {
      id: "menus",
      title: "Navigation menus and menubars",
      description: "A site's top navigation with panels, and an application's menu bar.",
      covers: ["NavigationMenu", "Menubar"],
    },
    {
      id: "unsaved",
      title: "Unsaved changes",
      description:
        "Asks before a page with unsaved edits is left, through a link, the back button or closing the tab.",
      covers: ["UnsavedChangesGuard"],
    },
  ],
};
