import { createSignal } from "@barqjs/core";
import {
  ResponsiveTabs,
  Stack,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Text,
  type TabItem,
} from "@barqjs/arc";
import { Bell } from "@barqjs/lucide/icons/bell";
import { FileText } from "@barqjs/lucide/icons/file-text";
import { Inbox } from "@barqjs/lucide/icons/inbox";

const TABS: TabItem[] = [
  { id: "inbox", label: "Inbox", icon: <Inbox />, count: 12 },
  { id: "invoices", label: "Invoices", icon: <FileText />, count: 4 },
  { id: "alerts", label: "Alerts", icon: <Bell /> },
  { id: "customers", label: "Customers" },
  { id: "contracts", label: "Contracts" },
  { id: "reports", label: "Reports" },
  { id: "audit", label: "Audit log" },
  { id: "archive", label: "Archive", isDisabled: true },
];

export default function TabSets() {
  const [tab, setTab] = createSignal("invoices");
  return (
    <Stack gap={8}>
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="usage">Usage</TabsTrigger>
          <TabsTrigger value="billing">Billing</TabsTrigger>
          <TabsTrigger value="legacy" disabled>
            Legacy
          </TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <Text>Acme Cloud runs 42 checks across 3 regions.</Text>
        </TabsContent>
        <TabsContent value="usage">
          <Text>1.2 million requests this month, 64% of the plan.</Text>
        </TabsContent>
        <TabsContent value="billing">
          <Text>The next invoice is due on December 1.</Text>
        </TabsContent>
      </Tabs>

      <Tabs defaultValue="activity">
        <TabsList variant="line">
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="comments">Comments</TabsTrigger>
          <TabsTrigger value="files">Files</TabsTrigger>
        </TabsList>
        <TabsContent value="activity">
          <Text size="sm" color="muted">
            The line variant, for a section inside a page.
          </Text>
        </TabsContent>
        <TabsContent value="comments">
          <Text size="sm" color="muted">
            No comments yet.
          </Text>
        </TabsContent>
        <TabsContent value="files">
          <Text size="sm" color="muted">
            Two files attached.
          </Text>
        </TabsContent>
      </Tabs>

      <Stack gap={2}>
        <ResponsiveTabs
          aria-label="Workspace"
          items={TABS}
          selectedKey={tab()}
          onSelectionChange={setTab}
        >
          {(item) => (
            <Text size="sm" color="muted">
              The {item.label.toLowerCase()} panel. Narrow the window: the tabs that do not fit move
              into a menu.
            </Text>
          )}
        </ResponsiveTabs>
        <Text size="xs" color="muted">
          Selected: {tab()}
        </Text>
      </Stack>

      <ResponsiveTabs
        aria-label="Reports, scrolling"
        items={TABS.slice(3)}
        overflow="scroll"
        variant="line"
      />
    </Stack>
  );
}
