import { describe, expect, test } from "bun:test";
import { createSignal, flush } from "@barqjs/core";
import {
  accessibleName,
  expectNoAriaViolations,
  render,
  screen,
  user,
  within,
} from "@barqjs/testing";
import { Button } from "./button.tsx";
import type { Key } from "./collections.ts";
import {
  NavigationTree,
  NavigationTreeHeader,
  NavigationTreeItem,
  NavigationTreeItemContent,
  NavigationTreeLink,
  NavigationTreeSection,
  type NavigationTreeItemRenderState,
} from "./navigation-tree.tsx";
import { TreeItemExpandButton } from "./tree.tsx";

interface Page {
  id: string;
  title: string;
  href?: string;
  kind?: "section";
  children?: Page[];
}

const PAGES: Page[] = [
  { id: "files", title: "Your files", href: "/files" },
  {
    id: "libraries",
    title: "Your libraries",
    href: "/libraries",
    children: [{ id: "projects-1", title: "Projects 1", href: "/projects-1" }],
  },
];

const THREE_LEVELS: Page[] = [
  { id: "files", title: "Your files", href: "/files" },
  {
    id: "libraries",
    title: "Your libraries",
    href: "/libraries",
    children: [
      {
        id: "projects-1",
        title: "Projects 1",
        href: "/projects-1",
        children: [{ id: "projects-1A", title: "Projects 1A", href: "/projects-1A" }],
      },
    ],
  },
];

/** Every click on an anchor that nothing cancelled: what the browser would follow. */
function watchLinks(): { followed: string[]; stop: () => void } {
  const followed: string[] = [];
  const record = (event: MouseEvent): void => {
    const anchor = (event.target as Element).closest("a");
    if (anchor === null) return;
    queueMicrotask(() => {
      if (!event.defaultPrevented) followed.push(anchor.getAttribute("href") ?? "");
    });
  };
  document.addEventListener("click", record, true);
  return { followed, stop: () => document.removeEventListener("click", record, true) };
}

function Pages(props: {
  items?: Page[];
  selectedRoute?: string | null;
  defaultExpandedKeys?: Iterable<Key>;
  withAction?: boolean;
}) {
  return (
    <NavigationTree
      aria-label="Pages"
      items={props.items ?? PAGES}
      selectedRoute={props.selectedRoute}
      defaultExpandedKeys={props.defaultExpandedKeys}
    >
      {(page: Page) => (
        <NavigationTreeItem>
          <NavigationTreeItemContent>
            {(item: NavigationTreeItemRenderState) => (
              <>
                <NavigationTreeLink>{page.title}</NavigationTreeLink>
                {() =>
                  props.withAction === true ? <Button aria-label="More actions">...</Button> : null
                }
                {() =>
                  item.hasChildItems() ? <TreeItemExpandButton>{">"}</TreeItemExpandButton> : null
                }
              </>
            )}
          </NavigationTreeItemContent>
        </NavigationTreeItem>
      )}
    </NavigationTree>
  );
}

function row(name: string): HTMLElement {
  return screen.getByRole("row", { name });
}

function link(name: string): HTMLElement {
  return screen.getByRole("link", { name });
}

function press(key: string): void {
  user.keyboard(`{${key}}`);
  flush();
}

describe("NavigationTree", () => {
  test("is a treegrid of rows that hold links", () => {
    render(() => <Pages />);
    const tree = screen.getByRole("treegrid");
    expect(accessibleName(tree)).toBe("Pages");
    expect(screen.getAllByRole("row")).toHaveLength(2);
    expect(link("Your files").getAttribute("href")).toBe("/files");
    expect(tree.hasAttribute("aria-multiselectable")).toBe(false);
    expect(row("Your files").hasAttribute("aria-selected")).toBe(false);
  });

  test("a resting tree carries none of the state attributes", () => {
    render(() => <Pages />);
    const tree = screen.getByRole("treegrid");
    for (const name of ["data-empty", "data-focused", "data-focus-visible"]) {
      expect(tree.hasAttribute(name)).toBe(false);
    }
    for (const element of screen.getAllByRole("row")) {
      expect(element.hasAttribute("data-level")).toBe(true);
      for (const name of [
        "data-selected",
        "data-disabled",
        "data-focused",
        "data-focus-visible",
        "data-pressed",
        "data-selection-mode",
        "data-current",
      ]) {
        expect(element.hasAttribute(name)).toBe(false);
      }
    }
  });

  test("the expand button opens and closes a level", () => {
    render(() => <Pages />);
    const libraries = row("Your libraries");
    expect(libraries.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("link", { name: "Projects 1" })).toBeNull();

    user.click(within(libraries).getByRole("button"));
    flush();
    expect(libraries.getAttribute("aria-expanded")).toBe("true");
    expect(link("Projects 1").getAttribute("aria-level")).toBeNull();
    expect(row("Projects 1").getAttribute("aria-level")).toBe("2");
  });

  test("the current route's link says so, and its row does", () => {
    const [route, setRoute] = createSignal("/files");
    render(() => <Pages selectedRoute={route()} />);

    expect(link("Your files").getAttribute("aria-current")).toBe("page");
    expect(row("Your files").hasAttribute("data-current")).toBe(true);
    expect(link("Your libraries").hasAttribute("aria-current")).toBe(false);
    expect(row("Your libraries").hasAttribute("data-current")).toBe(false);

    setRoute("/libraries");
    flush();
    expect(link("Your files").hasAttribute("aria-current")).toBe(false);
    expect(link("Your libraries").getAttribute("aria-current")).toBe("page");
    expect(row("Your libraries").hasAttribute("data-current")).toBe(true);
  });

  test("the content is handed whether its row is current", () => {
    render(() => (
      <NavigationTree aria-label="Pages" items={PAGES.slice(0, 1)} selectedRoute="/files">
        {() => (
          <NavigationTreeItem>
            <NavigationTreeItemContent>
              {(item: NavigationTreeItemRenderState) => (
                <NavigationTreeLink>
                  {() => (item.isCurrent() ? "current" : "not")}
                </NavigationTreeLink>
              )}
            </NavigationTreeItemContent>
          </NavigationTreeItem>
        )}
      </NavigationTree>
    ));
    expect(screen.getByRole("link").textContent).toBe("current");
  });

  test("every row above the current one is marked, open or closed, and the current one is not", () => {
    function Ancestors(props: { route: string; open?: Key[] }) {
      return (
        <NavigationTree
          aria-label="Pages"
          items={PAGES.slice(1)}
          selectedRoute={props.route}
          defaultExpandedKeys={props.open}
        >
          {(page: Page) => (
            <NavigationTreeItem>
              <NavigationTreeItemContent>
                {(item: NavigationTreeItemRenderState) => (
                  <>
                    <NavigationTreeLink>{page.title}</NavigationTreeLink>
                    <span data-testid={`ancestor-${page.id}`}>
                      {() => String(item.isCurrentAncestor())}
                    </span>
                  </>
                )}
              </NavigationTreeItemContent>
            </NavigationTreeItem>
          )}
        </NavigationTree>
      );
    }

    const closed = render(() => <Ancestors route="/projects-1" />);
    expect(screen.getByTestId("ancestor-libraries").textContent).toBe("true");
    expect(row("Your libraries").hasAttribute("data-current-ancestor")).toBe(true);
    closed.unmount();

    const open = render(() => <Ancestors route="/projects-1" open={["libraries"]} />);
    expect(screen.getByTestId("ancestor-libraries").textContent).toBe("true");
    expect(screen.getByTestId("ancestor-projects-1").textContent).toBe("false");
    expect(row("Projects 1").hasAttribute("data-current-ancestor")).toBe(false);
    open.unmount();

    render(() => <Ancestors route="/libraries" />);
    expect(screen.getByTestId("ancestor-libraries").textContent).toBe("false");
    expect(row("Your libraries").hasAttribute("data-current-ancestor")).toBe(false);
  });

  test("current, expanded, child items and level are all on the rows", () => {
    render(() => (
      <Pages
        items={THREE_LEVELS}
        defaultExpandedKeys={["libraries", "projects-1"]}
        selectedRoute="/projects-1"
      />
    ));
    const files = row("Your files");
    const libraries = row("Your libraries");
    const projects = row("Projects 1");
    const leaf = row("Projects 1A");

    expect(projects.hasAttribute("data-current")).toBe(true);
    expect(files.hasAttribute("data-current")).toBe(false);
    expect(libraries.hasAttribute("data-current")).toBe(false);
    expect(leaf.hasAttribute("data-current")).toBe(false);

    expect(libraries.hasAttribute("data-expanded")).toBe(true);
    expect(libraries.hasAttribute("data-has-child-items")).toBe(true);
    expect(projects.hasAttribute("data-expanded")).toBe(true);
    expect(leaf.hasAttribute("data-expanded")).toBe(false);
    expect(leaf.hasAttribute("data-has-child-items")).toBe(false);

    expect([files, libraries, projects, leaf].map((element) => element.dataset.level)).toEqual([
      "1",
      "1",
      "2",
      "3",
    ]);

    expect(libraries.hasAttribute("data-current-ancestor")).toBe(true);
    expect(files.hasAttribute("data-current-ancestor")).toBe(false);
    expect(projects.hasAttribute("data-current-ancestor")).toBe(false);
    expect(leaf.hasAttribute("data-current-ancestor")).toBe(false);
  });

  test("has no ARIA violations", () => {
    const { container } = render(() => (
      <Pages items={THREE_LEVELS} defaultExpandedKeys={["libraries"]} selectedRoute="/files" />
    ));
    expectNoAriaViolations(container);
  });
});

describe("keyboard", () => {
  test("Tab lands on the current route's link", () => {
    render(() => (
      <Pages items={THREE_LEVELS} defaultExpandedKeys={["libraries"]} selectedRoute="/projects-1" />
    ));
    user.tab();
    expect(document.activeElement).toBe(link("Projects 1"));
  });

  test("under a collapsed parent, Tab lands on the closest row that is showing", () => {
    render(() => <Pages items={THREE_LEVELS} selectedRoute="/projects-1" />);
    expect(row("Your libraries").getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("link", { name: "Projects 1" })).toBeNull();
    user.tab();
    expect(document.activeElement).toBe(link("Your libraries"));
  });

  test("an open parent hidden by a closed one above it is skipped for the one that shows", () => {
    render(() => (
      <Pages
        items={THREE_LEVELS}
        defaultExpandedKeys={["projects-1"]}
        selectedRoute="/projects-1A"
      />
    ));
    expect(row("Your libraries").getAttribute("aria-expanded")).toBe("false");
    user.tab();
    expect(document.activeElement).toBe(link("Your libraries"));
  });

  test("a route that changes moves the roving focus with it", () => {
    const [route, setRoute] = createSignal("/files");
    render(() => (
      <>
        <Pages selectedRoute={route()} defaultExpandedKeys={["libraries"]} />
        <input aria-label="After" />
      </>
    ));
    setRoute("/projects-1");
    flush();
    user.tab();
    expect(document.activeElement).toBe(link("Projects 1"));
  });

  test("Right and Left on a link expand and collapse its row", () => {
    render(() => <Pages />);
    const libraries = row("Your libraries");
    user.tab();
    press("ArrowDown");
    expect(document.activeElement).toBe(link("Your libraries"));

    press("ArrowRight");
    expect(libraries.getAttribute("aria-expanded")).toBe("true");
    expect(link("Projects 1")).toBeDefined();
    expect(document.activeElement).toBe(link("Your libraries"));

    press("ArrowLeft");
    expect(libraries.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("link", { name: "Projects 1" })).toBeNull();
  });

  test("Left from a deep leaf steps to the parent, collapses it, then moves up again", () => {
    render(() => (
      <Pages
        items={THREE_LEVELS}
        defaultExpandedKeys={["libraries", "projects-1"]}
        selectedRoute="/projects-1A"
      />
    ));
    user.tab();
    expect(document.activeElement).toBe(link("Projects 1A"));

    press("ArrowLeft");
    expect(document.activeElement).toBe(link("Projects 1"));
    expect(row("Projects 1").getAttribute("aria-expanded")).toBe("true");

    press("ArrowLeft");
    expect(row("Projects 1").getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("link", { name: "Projects 1A" })).toBeNull();
    expect(document.activeElement).toBe(link("Projects 1"));

    press("ArrowLeft");
    expect(document.activeElement).toBe(link("Your libraries"));
  });

  test("Down moves from link to link", () => {
    render(() => <Pages defaultExpandedKeys={["libraries"]} />);
    user.tab();
    expect(document.activeElement).toBe(link("Your files"));
    press("ArrowDown");
    expect(document.activeElement).toBe(link("Your libraries"));
    press("ArrowDown");
    expect(document.activeElement).toBe(link("Projects 1"));
    press("ArrowUp");
    expect(document.activeElement).toBe(link("Your libraries"));
  });

  test("one Tab leaves the tree from a link", () => {
    render(() => (
      <>
        <Pages selectedRoute="/files" />
        <input aria-label="After" />
      </>
    ));
    user.tab();
    expect(document.activeElement).toBe(link("Your files"));
    user.tab();
    expect(document.activeElement?.getAttribute("aria-label")).toBe("After");
  });

  test("one Shift+Tab leaves the tree from a link", () => {
    render(() => (
      <>
        <input aria-label="Before" />
        <Pages selectedRoute="/files" />
      </>
    ));
    user.tab();
    user.tab();
    expect(document.activeElement).toBe(link("Your files"));
    user.tab({ shift: true });
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Before");
  });

  test("a row with no href keeps focus itself, not on its other controls", () => {
    render(() => (
      <Pages
        withAction
        items={[
          { id: "files", title: "Your files", href: "/files" },
          {
            id: "section",
            title: "Section",
            children: [{ id: "section-2", title: "Section 2", href: "/section-2" }],
          },
        ]}
      />
    ));
    user.tab();
    expect(document.activeElement).toBe(link("Your files"));
    press("ArrowDown");
    const section = row("Section");
    expect(document.activeElement).toBe(section);
  });

  test("Enter on a link follows it", async () => {
    const links = watchLinks();
    render(() => <Pages selectedRoute="/files" />);
    user.tab();
    press("ArrowDown");
    press("Enter");
    await Promise.resolve();
    links.stop();
    expect(links.followed).toEqual(["/libraries"]);
  });
});

describe("pointer", () => {
  test("pressing the label of a row with no href opens and closes it", () => {
    render(() => (
      <Pages
        items={[
          {
            id: "section",
            title: "Section",
            children: [{ id: "section-2", title: "Section 2", href: "/section-2" }],
          },
        ]}
      />
    ));
    const section = row("Section");
    expect(section.getAttribute("aria-expanded")).toBe("false");

    user.click(within(section).getByRole("link", { name: "Section" }));
    flush();
    expect(section.getAttribute("aria-expanded")).toBe("true");

    user.click(within(section).getByRole("link", { name: "Section" }));
    flush();
    expect(section.getAttribute("aria-expanded")).toBe("false");
  });

  test("clicking a link follows it, and does not toggle its row", async () => {
    const links = watchLinks();
    render(() => <Pages />);
    user.click(link("Your libraries"));
    flush();
    await Promise.resolve();
    links.stop();
    expect(links.followed).toEqual(["/libraries"]);
    expect(row("Your libraries").getAttribute("aria-expanded")).toBe("false");
  });
});

describe("focus ring", () => {
  test("the row rings for its link, not for another control in it", () => {
    render(() => (
      <NavigationTree aria-label="Pages" items={PAGES.slice(0, 1)} selectedRoute="/files">
        {() => (
          <NavigationTreeItem>
            <NavigationTreeItemContent>
              <NavigationTreeLink>Your files</NavigationTreeLink>
              <Button>Other</Button>
            </NavigationTreeItemContent>
          </NavigationTreeItem>
        )}
      </NavigationTree>
    ));
    const files = row("Your files");
    expect(files.hasAttribute("data-focus-visible")).toBe(false);

    user.tab();
    expect(document.activeElement).toBe(link("Your files"));
    expect(files.hasAttribute("data-focus-visible")).toBe(true);

    user.tab();
    expect(document.activeElement?.textContent).toBe("Other");
    expect(files.hasAttribute("data-focus-visible")).toBe(false);
  });
});

describe("scrolling to the current route", () => {
  test("scrolls the tree, when it scrolls, to centre the current row", () => {
    const [route, setRoute] = createSignal<string | null>(null);
    render(() => (
      <Pages
        items={THREE_LEVELS}
        defaultExpandedKeys={["libraries", "projects-1"]}
        selectedRoute={route()}
      />
    ));
    const tree = screen.getByRole("treegrid");
    tree.style.overflow = "auto";
    Object.defineProperty(tree, "clientHeight", { value: 40, configurable: true });
    Object.defineProperty(tree, "scrollHeight", { value: 400, configurable: true });
    Object.defineProperty(tree, "offsetHeight", { value: 40, configurable: true });
    tree.getBoundingClientRect = () => new DOMRect(0, 0, 200, 40);
    const leaf = row("Projects 1A");
    leaf.getBoundingClientRect = () => new DOMRect(0, 300, 200, 20);

    setRoute("/projects-1A");
    flush();
    expect(tree.scrollTop).toBe(290);
  });
});

describe("sections", () => {
  const SECTIONED: Page[] = [
    {
      id: "section-1",
      title: "Section 1",
      kind: "section",
      children: [{ id: "files", title: "Your files", href: "/files" }],
    },
    {
      id: "section-2",
      title: "Section 2",
      kind: "section",
      children: [{ id: "libraries", title: "Your libraries", href: "/libraries" }],
    },
  ];

  test("groups rows under a label or a header", () => {
    const { container } = render(() => (
      <NavigationTree
        aria-label="Pages"
        items={SECTIONED}
        getType={(page: Page) => (page.kind === "section" ? "section" : "item")}
      >
        {(page: Page) =>
          page.kind === "section" ? (
            page.id === "section-1" ? (
              <NavigationTreeSection aria-label={page.title} />
            ) : (
              <NavigationTreeSection>
                <NavigationTreeHeader>{page.title}</NavigationTreeHeader>
              </NavigationTreeSection>
            )
          ) : (
            <NavigationTreeItem>
              <NavigationTreeItemContent>
                <NavigationTreeLink>{page.title}</NavigationTreeLink>
              </NavigationTreeItemContent>
            </NavigationTreeItem>
          )
        }
      </NavigationTree>
    ));

    const groups = screen.getAllByRole("rowgroup");
    expect(groups).toHaveLength(2);
    expect(accessibleName(groups[0] as HTMLElement)).toBe("Section 1");
    expect(accessibleName(groups[1] as HTMLElement)).toBe("Section 2");
    expect(within(groups[1] as HTMLElement).getByRole("rowheader").textContent).toBe("Section 2");
    expect(
      screen.getAllByRole("row").filter((element) => element.hasAttribute("data-key")),
    ).toHaveLength(2);
    expectNoAriaViolations(container);
  });
});
