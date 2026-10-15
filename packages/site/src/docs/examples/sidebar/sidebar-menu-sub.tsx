import { For } from "@barqjs/core";
import { css } from "@barqjs/css";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
} from "@barqjs/ui";

/**
 * `transform` makes the fixed sidebar resolve against this box rather than the
 * viewport, and the provider's `min-height` is the box's rather than the
 * screen's, which is right for a page shell and wrong in a card.
 */
const frame = css`
  position: relative;
  height: 28rem;
  width: 100%;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  transform: translateZ(0);
`;

const fill = css`
  min-height: 100%;
  height: 100%;
`;

const items = [
  {
    title: "Getting Started",
    url: "#",
    items: [
      { title: "Installation", url: "#" },
      { title: "Project Structure", url: "#" },
    ],
  },
  {
    title: "Build Your Application",
    url: "#",
    items: [
      { title: "Routing", url: "#" },
      { title: "Data Fetching", url: "#", isActive: true },
      { title: "Rendering", url: "#" },
      { title: "Caching", url: "#" },
      { title: "Styling", url: "#" },
      { title: "Optimizing", url: "#" },
      { title: "Configuring", url: "#" },
      { title: "Testing", url: "#" },
      { title: "Authentication", url: "#" },
      { title: "Deploying", url: "#" },
      { title: "Upgrading", url: "#" },
      { title: "Examples", url: "#" },
    ],
  },
  {
    title: "API Reference",
    url: "#",
    items: [
      { title: "Components", url: "#" },
      { title: "File Conventions", url: "#" },
      { title: "Functions", url: "#" },
      { title: "next.config.js Options", url: "#" },
      { title: "CLI", url: "#" },
      { title: "Edge Runtime", url: "#" },
    ],
  },
  {
    title: "Architecture",
    url: "#",
    items: [
      { title: "Accessibility", url: "#" },
      { title: "Fast Refresh", url: "#" },
      { title: "Next.js Compiler", url: "#" },
      { title: "Supported Browsers", url: "#" },
      { title: "Turbopack", url: "#" },
    ],
  },
];

type Section = (typeof items)[number];
type Page = Section["items"][number];

export default function SidebarMenuSubDemo() {
  return (
    <div class={frame}>
      <SidebarProvider class={fill}>
        <Sidebar>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  <For each={items}>
                    {(item: Section) => (
                      <SidebarMenuItem>
                        <SidebarMenuButton href={item.url}>
                          <span>{item.title}</span>
                        </SidebarMenuButton>
                        <SidebarMenuSub>
                          <For each={item.items}>
                            {(subItem: Page) => (
                              <SidebarMenuSubItem>
                                <SidebarMenuSubButton href={subItem.url}>
                                  <span>{subItem.title}</span>
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                            )}
                          </For>
                        </SidebarMenuSub>
                      </SidebarMenuItem>
                    )}
                  </For>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
        </Sidebar>
      </SidebarProvider>
    </div>
  );
}
