/**
 * What each block is called and says about itself, as data and nothing else.
 *
 * Apart from `registry.ts`, which adds the components, so `@barqjs/ui`'s
 * registry generator can read it: that runs outside the compiler and cannot
 * import a module that imports a `.tsx`.
 */

export interface BlockMeta {
  /** shadcn's own registry name, which is the address the block lives at. */
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly categories: readonly string[];
}

export const CATALOG = [
  {
    name: "dashboard-01",
    title: "Dashboard 01",
    description: "A dashboard with a sidebar, charts and a data table.",
    categories: ["dashboard"],
  },
  {
    name: "sidebar-01",
    title: "Sidebar 01",
    description: "A simple sidebar with navigation grouped by section.",
    categories: ["sidebar", "dashboard"],
  },
  {
    name: "sidebar-02",
    title: "Sidebar 02",
    description: "A sidebar with collapsible sections.",
    categories: ["sidebar", "dashboard"],
  },
  {
    name: "sidebar-03",
    title: "Sidebar 03",
    description: "A sidebar with submenus.",
    categories: ["sidebar", "dashboard"],
  },
  {
    name: "sidebar-04",
    title: "Sidebar 04",
    description: "A floating sidebar with submenus.",
    categories: ["sidebar", "dashboard"],
  },
  {
    name: "sidebar-05",
    title: "Sidebar 05",
    description: "A sidebar with collapsible submenus.",
    categories: ["sidebar", "dashboard"],
  },
  {
    name: "sidebar-06",
    title: "Sidebar 06",
    description: "A sidebar with submenus as dropdowns.",
    categories: ["sidebar", "dashboard"],
  },
  {
    name: "sidebar-07",
    title: "Sidebar 07",
    description: "A sidebar that collapses to icons, with a team switcher.",
    categories: ["sidebar"],
  },
  {
    name: "sidebar-08",
    title: "Sidebar 08",
    description: "An inset sidebar with secondary navigation.",
    categories: ["sidebar", "dashboard"],
  },
  {
    name: "sidebar-09",
    title: "Sidebar 09",
    description: "Collapsible nested sidebars.",
    categories: ["sidebar", "dashboard"],
  },
  {
    name: "sidebar-10",
    title: "Sidebar 10",
    description: "A sidebar in a popover.",
    categories: ["sidebar", "dashboard"],
  },
  {
    name: "sidebar-11",
    title: "Sidebar 11",
    description: "A sidebar with a collapsible file tree.",
    categories: ["sidebar", "dashboard"],
  },
  {
    name: "sidebar-12",
    title: "Sidebar 12",
    description: "A sidebar with a calendar.",
    categories: ["sidebar", "dashboard"],
  },
  {
    name: "sidebar-13",
    title: "Sidebar 13",
    description: "A sidebar in a dialog.",
    categories: ["sidebar", "dashboard"],
  },
  {
    name: "sidebar-14",
    title: "Sidebar 14",
    description: "A sidebar on the right.",
    categories: ["sidebar", "dashboard"],
  },
  {
    name: "sidebar-15",
    title: "Sidebar 15",
    description: "A left and right sidebar.",
    categories: ["sidebar", "dashboard"],
  },
  {
    name: "sidebar-16",
    title: "Sidebar 16",
    description: "A sidebar with a sticky site header.",
    categories: ["sidebar", "dashboard"],
  },
  {
    name: "login-01",
    title: "Login 01",
    description: "A simple login form.",
    categories: ["authentication", "login"],
  },
  {
    name: "login-02",
    title: "Login 02",
    description: "A two column login page with a cover image.",
    categories: ["authentication", "login"],
  },
  {
    name: "login-03",
    title: "Login 03",
    description: "A login page with a muted background color.",
    categories: ["authentication", "login"],
  },
  {
    name: "login-04",
    title: "Login 04",
    description: "A login page with an image and a separated provider row.",
    categories: ["authentication", "login"],
  },
  {
    name: "login-05",
    title: "Login 05",
    description: "A simple email-only login page.",
    categories: ["authentication", "login"],
  },
  {
    name: "signup-01",
    title: "Signup 01",
    description: "A simple signup form.",
    categories: ["authentication", "signup"],
  },
  {
    name: "signup-02",
    title: "Signup 02",
    description: "A two column signup page with a cover image.",
    categories: ["authentication", "signup"],
  },
  {
    name: "signup-03",
    title: "Signup 03",
    description: "A signup page with a muted background color.",
    categories: ["authentication", "signup"],
  },
  {
    name: "signup-04",
    title: "Signup 04",
    description: "A signup page with form and image.",
    categories: ["authentication", "signup"],
  },
  {
    name: "signup-05",
    title: "Signup 05",
    description: "A simple signup form with social providers.",
    categories: ["authentication", "signup"],
  },
] as const satisfies readonly BlockMeta[];

export type BlockName = (typeof CATALOG)[number]["name"];
