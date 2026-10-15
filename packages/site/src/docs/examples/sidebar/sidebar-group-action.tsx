import { css } from "@barqjs/css";
import { ChartPie } from "@barqjs/lucide/icons/chart-pie";
import { Frame } from "@barqjs/lucide/icons/frame";
import { Map as MapIcon } from "@barqjs/lucide/icons/map";
import { Plus } from "@barqjs/lucide/icons/plus";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  srOnly,
  toast,
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

export default function SidebarGroupActionDemo() {
  return (
    <div class={frame}>
      <SidebarProvider class={fill}>
        <Sidebar>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Projects</SidebarGroupLabel>
              <SidebarGroupAction
                title="Add Project"
                onClick={() => {
                  toast("You clicked the group action!");
                }}
              >
                <Plus /> <span class={srOnly}>Add Project</span>
              </SidebarGroupAction>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton href="#">
                      <Frame />
                      <span>Design Engineering</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton href="#">
                      <ChartPie />
                      <span>Sales & Marketing</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton href="#">
                      <MapIcon />
                      <span>Travel</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
        </Sidebar>
      </SidebarProvider>
    </div>
  );
}
