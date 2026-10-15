import { css } from "@barqjs/css";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@barqjs/ui";

const frame = css`
  width: 400px;
  max-width: 100%;
`;

const summary = css`
  font-size: 0.875rem;
  line-height: 1.25rem;
  color: var(--muted-foreground);
`;

export default function TabsDemo() {
  return (
    <Tabs defaultValue="overview" class={frame}>
      <TabsList>
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="analytics">Analytics</TabsTrigger>
        <TabsTrigger value="reports">Reports</TabsTrigger>
        <TabsTrigger value="settings">Settings</TabsTrigger>
      </TabsList>
      <TabsContent value="overview">
        <Card>
          <CardHeader>
            <CardTitle>Overview</CardTitle>
            <CardDescription>
              View your key metrics and recent project activity. Track progress across all your
              active projects.
            </CardDescription>
          </CardHeader>
          <CardContent class={summary}>
            You have 12 active projects and 3 pending tasks.
          </CardContent>
        </Card>
      </TabsContent>
      <TabsContent value="analytics">
        <Card>
          <CardHeader>
            <CardTitle>Analytics</CardTitle>
            <CardDescription>
              Track performance and user engagement metrics. Monitor trends and identify growth
              opportunities.
            </CardDescription>
          </CardHeader>
          <CardContent class={summary}>Page views are up 25% compared to last month.</CardContent>
        </Card>
      </TabsContent>
      <TabsContent value="reports">
        <Card>
          <CardHeader>
            <CardTitle>Reports</CardTitle>
            <CardDescription>
              Generate and download your detailed reports. Export data in multiple formats for
              analysis.
            </CardDescription>
          </CardHeader>
          <CardContent class={summary}>
            You have 5 reports ready and available to export.
          </CardContent>
        </Card>
      </TabsContent>
      <TabsContent value="settings">
        <Card>
          <CardHeader>
            <CardTitle>Settings</CardTitle>
            <CardDescription>
              Manage your account preferences and options. Customize your experience to fit your
              needs.
            </CardDescription>
          </CardHeader>
          <CardContent class={summary}>Configure notifications, security, and themes.</CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
