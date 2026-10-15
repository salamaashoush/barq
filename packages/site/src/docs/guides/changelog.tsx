import { For, type Incoming } from "@barqjs/core";

import { anchor, type DocsSection } from "../../docs.tsx";

interface Entry {
  readonly title: string;
  readonly body: string;
  /** Component pages the entry is about, by slug. */
  readonly pages?: readonly string[];
}

interface Month {
  readonly id: string;
  readonly label: string;
  readonly entries: readonly Entry[];
}

export const MONTHS: readonly Month[] = [
  {
    id: "october-2026",
    label: "October 2026",
    entries: [
      {
        title: "Composable parts",
        body: "Combobox, Command, Select and the three menus can be written as parts, the way their shadcn/ui examples are: groups, labels, separators, checkbox and radio items, submenus and link items. The data form with `items` stays.",
        pages: ["combobox", "command", "select", "dropdown-menu", "context-menu", "menubar"],
      },
      {
        title: "Questionnaire, Toast, Scroll Fade and Shimmer",
        body: "Four additions: a multi-step questionnaire, a toast with a manager of its own beside Sonner, and two style helpers for a fading scroll edge and a shimmering line of text.",
        pages: ["questionnaire", "toast", "scroll-fade", "shimmer"],
      },
      {
        title: "Direction",
        body: "`DirectionProvider` and `useDirection` set and read the text direction, and every example page has a right-to-left preview.",
        pages: ["direction"],
      },
      {
        title: "Calendar and date pickers",
        body: "The calendar takes `single`, `multiple` and `range` modes, several months side by side and dropdown captions. `DateRangePicker` picks a start and an end.",
        pages: ["calendar", "date-picker"],
      },
      {
        title: "Drawer, resizable and input OTP",
        body: "The drawer has snap points, a resizable panel can collapse, and the one-time-password input takes a pattern.",
        pages: ["drawer", "resizable", "input-otp"],
      },
      {
        title: "CLI",
        body: "`add` takes `--all`, `--dry-run`, `--diff` and `--view`. `search`, `view` and `info` are new commands, and `components.json` can name more registries by scope.",
      },
      {
        title: "Guides",
        body: "The documentation has pages for installation, `components.json`, theming, dark mode, right-to-left support, the CLI, forms and running a registry.",
      },
    ],
  },
  {
    id: "september-2026",
    label: "September 2026",
    entries: [
      {
        title: "A page per component",
        body: "The site is server-rendered on file routes, with one documentation page per component, syntax-coloured code panels, blocks at their own addresses and chart pages for seven chart families.",
      },
      {
        title: "Every component matched to shadcn/ui's current registry",
        body: "The class lists are read out of a pinned checkout of shadcn/ui rather than typed in, and each component was brought to the current upstream one.",
        pages: ["button", "card", "accordion", "field", "item", "input-group"],
      },
      {
        title: "Blocks and the create page",
        body: "`dashboard-01`, `sidebar-07` and `login-04` are ported as blocks, and the create page previews a whole application under the theme being designed.",
      },
      {
        title: "Message Scroller and the chat components",
        body: "A scroller that stays at the bottom of a conversation, with the attachment, bubble, marker and message parts.",
        pages: ["message-scroller", "attachment", "bubble", "marker", "message"],
      },
    ],
  },
  {
    id: "august-2026",
    label: "August 2026",
    entries: [
      {
        title: "First release",
        body: "shadcn/ui's components and every one of its colour themes, for barq, with the eight component styles transcribed.",
      },
      {
        title: "CLI",
        body: "`barq-ui` copies components into your project and records a hash per file, so `sync` can take an upstream change and keep your edits. `init` asks for the whole theme.",
      },
      {
        title: "The larger components",
        body: "Sidebar, Chart, Calendar, the date pickers, Combobox, Command, Context Menu, Navigation Menu, Carousel, Drawer, Resizable, Sonner and Input OTP.",
        pages: ["sidebar", "chart", "calendar", "combobox", "command", "carousel", "sonner"],
      },
    ],
  },
];

export const sections: readonly DocsSection[] = MONTHS.map((month) => ({
  id: month.id,
  label: month.label,
}));

function Text(props: Incoming<{ text: string }>) {
  const parts = props
    .text()
    .split("`")
    .map((text, at) => ({ text, code: at % 2 === 1 }))
    .filter((part) => part.text !== "");
  return (
    <For each={() => parts}>
      {(part: { text: string; code: boolean }) =>
        part.code ? <code>{part.text}</code> : <span>{part.text}</span>
      }
    </For>
  );
}

export function Body() {
  return (
    <For each={() => MONTHS}>
      {(month: Month) => (
        <>
          <h2 class={anchor} id={month.id}>
            {month.label}
          </h2>
          <For each={() => month.entries}>
            {(entry: Entry) => (
              <>
                <h3>{entry.title}</h3>
                <p>
                  <Text text={entry.body} />
                </p>
              </>
            )}
          </For>
        </>
      )}
    </For>
  );
}
