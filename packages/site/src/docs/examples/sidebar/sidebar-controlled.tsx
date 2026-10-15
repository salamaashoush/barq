import { For, createSignal, Show } from "@barqjs/core";
import { css } from "@barqjs/css";
import { ChartPie } from "@barqjs/lucide/icons/chart-pie";
import { Frame } from "@barqjs/lucide/icons/frame";
import { LifeBuoy } from "@barqjs/lucide/icons/life-buoy";
import { Map as MapIcon } from "@barqjs/lucide/icons/map";
import { Send } from "@barqjs/lucide/icons/send";
import { PanelLeftClose } from "@barqjs/lucide/icons/panel-left-close";
import { PanelLeftOpen } from "@barqjs/lucide/icons/panel-left-open";
import {
  Button,
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarInset,
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

const header = css`
  display: flex;
  height: calc(var(--spacing) * 12);
  align-items: center;
  justify-content: space-between;
  padding-inline: calc(var(--spacing) * 4);
`;

const projects = [
  { name: "Design Engineering", url: "#", icon: Frame },
  { name: "Sales & Marketing", url: "#", icon: ChartPie },
  { name: "Travel", url: "#", icon: MapIcon },
  { name: "Support", url: "#", icon: LifeBuoy },
  { name: "Feedback", url: "#", icon: Send },
];

export default function SidebarControlled() {
  const [open, setOpen] = createSignal(true);

  return (
    <div class={frame}>
      <SidebarProvider class={fill} open={open()} onOpenChange={setOpen}>
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
        <SidebarInset>
          <header class={header}>
            <Button onPress={() => setOpen(!open())} size="sm" variant="ghost">
              <Show when={open()} fallback={<PanelLeftOpen />}>
                <PanelLeftClose />
              </Show>
              <span>{open() ? "Close" : "Open"} Sidebar</span>
            </Button>
          </header>
        </SidebarInset>
      </SidebarProvider>
    </div>
  );
}
