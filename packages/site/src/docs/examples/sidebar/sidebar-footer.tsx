import { css } from "@barqjs/css";
import { ChevronUp } from "@barqjs/lucide/icons/chevron-up";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
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

const opened = css`
  &[data-state="open"] {
    background-color: var(--sidebar-accent);
    color: var(--sidebar-accent-foreground);
  }
`;

const end = css`
  margin-inline-start: auto;
`;

const anchored = css`
  width: var(--barq-trigger-width);
`;

export default function SidebarFooterDemo() {
  return (
    <div class={frame}>
      <SidebarProvider class={fill}>
        <Sidebar>
          <SidebarHeader />
          <SidebarContent />
          <SidebarFooter>
            <SidebarMenu>
              <SidebarMenuItem>
                <DropdownMenu>
                  <DropdownMenuTrigger>
                    <SidebarMenuButton class={opened}>
                      Username
                      <ChevronUp class={end} />
                    </SidebarMenuButton>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent side="top" class={anchored}>
                    <DropdownMenuItem>
                      <span>Account</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem>
                      <span>Billing</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem>
                      <span>Sign out</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>
        </Sidebar>
        <SidebarInset>
          <header class={header}>
            <SidebarTrigger />
          </header>
        </SidebarInset>
      </SidebarProvider>
    </div>
  );
}
