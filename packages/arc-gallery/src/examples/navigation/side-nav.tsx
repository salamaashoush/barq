import { createSignal } from "@barqjs/core";
import { BottomNavigation, Grid, SideNav, Stack, Text } from "@barqjs/arc";
import { Bell } from "@barqjs/lucide/icons/bell";
import { CreditCard } from "@barqjs/lucide/icons/credit-card";
import { House } from "@barqjs/lucide/icons/house";
import { Inbox } from "@barqjs/lucide/icons/inbox";
import { Search } from "@barqjs/lucide/icons/search";
import { Settings } from "@barqjs/lucide/icons/settings";
import { User } from "@barqjs/lucide/icons/user";
import { Users } from "@barqjs/lucide/icons/users";

export default function SideNavigation() {
  const [tab, setTab] = createSignal("home");
  return (
    <Grid columns={{ base: 1, cqMd: 2 }} gap={8}>
      <Stack gap={2}>
        <SideNav
          aria-label="Settings"
          navigation={[
            {
              label: "Account",
              items: [
                {
                  label: "Profile",
                  to: "/navigation",
                  search: { settings: "profile" },
                  icon: User,
                },
                {
                  label: "Notifications",
                  to: "/navigation",
                  search: { settings: "notifications" },
                  icon: Bell,
                },
              ],
            },
            {
              label: "Workspace",
              items: [
                {
                  label: "Members",
                  to: "/navigation",
                  search: { settings: "members" },
                  icon: Users,
                  badge: "4",
                },
                {
                  label: "Billing",
                  to: "/navigation",
                  search: { settings: "billing" },
                  icon: CreditCard,
                  items: [
                    { label: "Plan", to: "/navigation", search: { settings: "plan" } },
                    { label: "Invoices", to: "/navigation", search: { settings: "invoices" } },
                  ],
                },
                {
                  label: "General",
                  to: "/navigation",
                  search: { settings: "general" },
                  icon: Settings,
                },
              ],
            },
          ]}
        />
        <Text size="xs" color="muted">
          Each item is a router link, current while its search holds.
        </Text>
      </Stack>
      <Stack gap={2}>
        <BottomNavigation
          aria-label="Phone tabs"
          position="static"
          hideFrom="never"
          selectedKey={tab()}
          onSelectionChange={setTab}
          items={[
            { id: "home", label: "Home", icon: House },
            { id: "inbox", label: "Inbox", icon: Inbox, count: 3 },
            { id: "search", label: "Search", icon: Search },
            { id: "account", label: "Account", icon: User, dot: true },
          ]}
        />
        <Text size="xs" color="muted">
          Showing {tab()}. On a phone the bar sits at the bottom of the screen.
        </Text>
      </Stack>
    </Grid>
  );
}
