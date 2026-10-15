import { css } from "@barqjs/css";
import { ChevronDown } from "@barqjs/lucide/icons/chevron-down";
import { LifeBuoy } from "@barqjs/lucide/icons/life-buoy";
import { Send } from "@barqjs/lucide/icons/send";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  sidebarGroupLabelVariants,
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

const label = css`
  font-size: 0.875rem;
  line-height: 1.25rem;

  &:hover {
    background-color: var(--sidebar-accent);
    color: var(--sidebar-accent-foreground);
  }
`;

const chevron = css`
  margin-inline-start: auto;
  transition: transform 150ms;

  [data-state="open"] > [data-slot="sidebar-group"] > [data-slot="sidebar-group-label"] > & {
    transform: rotate(180deg);
  }
`;

export default function SidebarGroupCollapsible() {
  return (
    <div class={frame}>
      <SidebarProvider class={fill}>
        <Sidebar>
          <SidebarContent>
            <Collapsible defaultOpen>
              <SidebarGroup>
                <CollapsibleTrigger
                  data-slot="sidebar-group-label"
                  class={`${sidebarGroupLabelVariants()} ${label}`}
                >
                  Help
                  <ChevronDown class={chevron} />
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      <SidebarMenuItem>
                        <SidebarMenuButton>
                          <LifeBuoy />
                          Support
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                      <SidebarMenuItem>
                        <SidebarMenuButton>
                          <Send />
                          Feedback
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    </SidebarMenu>
                  </SidebarGroupContent>
                </CollapsibleContent>
              </SidebarGroup>
            </Collapsible>
          </SidebarContent>
        </Sidebar>
      </SidebarProvider>
    </div>
  );
}
