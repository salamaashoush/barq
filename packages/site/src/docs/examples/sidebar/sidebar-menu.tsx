import { For } from "@barqjs/core";
import { css } from "@barqjs/css";
import { ChartPie } from "@barqjs/lucide/icons/chart-pie";
import { Frame } from "@barqjs/lucide/icons/frame";
import { LifeBuoy } from "@barqjs/lucide/icons/life-buoy";
import { Map as MapIcon } from "@barqjs/lucide/icons/map";
import { Send } from "@barqjs/lucide/icons/send";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
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

const projects = [
  { name: "Design Engineering", url: "#", icon: Frame },
  { name: "Sales & Marketing", url: "#", icon: ChartPie },
  { name: "Travel", url: "#", icon: MapIcon },
  { name: "Support", url: "#", icon: LifeBuoy },
  { name: "Feedback", url: "#", icon: Send },
];

export default function SidebarMenuDemo() {
  return (
    <div class={frame}>
      <SidebarProvider class={fill}>
        <Sidebar>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Projects</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <For each={projects}>
                    {(project: (typeof projects)[number]) => (
                      <SidebarMenuItem>
                        <SidebarMenuButton href={project.url}>
                          <project.icon />
                          <span>{project.name}</span>
                        </SidebarMenuButton>
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
