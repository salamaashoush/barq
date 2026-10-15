import { AppWindow } from "@barqjs/lucide/icons/app-window";
import { Code } from "@barqjs/lucide/icons/code";
import { Tabs, TabsList, TabsTrigger } from "@barqjs/ui";

export default function TabsIcons() {
  return (
    <Tabs defaultValue="preview">
      <TabsList>
        <TabsTrigger value="preview">
          <AppWindow />
          Preview
        </TabsTrigger>
        <TabsTrigger value="code">
          <Code />
          Code
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
