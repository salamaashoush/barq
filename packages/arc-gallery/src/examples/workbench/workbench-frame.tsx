import { createSignal } from "@barqjs/core";
import {
  Button,
  ConsoleLogView,
  Inline,
  type LogEntry,
  ProblemsPanel,
  StatusBar,
  Text,
  Workbench,
  problemCounts,
} from "@barqjs/arc";
import { CodeEditor } from "@barqjs/arc/code";
import { place } from "@barqjs/arc/style";
import { Play } from "@barqjs/lucide/icons/play";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@barqjs/ui/resizable";

import { PROBLEMS } from "./data.ts";

const PROGRAM = Array.from(
  { length: 60 },
  (_, line) => `let row${String(line)} = ${String(line)} * step  // line ${String(line + 1)}`,
).join("\n");

const OUTPUT: LogEntry[] = Array.from({ length: 40 }, (_, at) => ({
  id: String(at),
  level: at % 13 === 12 ? "warn" : "log",
  time: at * 25,
  text: `row ${String(at)} = ${String(at * 3)}`,
}));

export default function WorkbenchFrame() {
  const [code, setCode] = createSignal(PROGRAM);
  const [panel, setPanel] = createSignal<"problems" | "output">("output");
  return (
    <div style={{ height: "36rem" }}>
      <Workbench
        fill="parent"
        aria-label="Toy playground"
        bar={
          <Inline justify="between" gap={2}>
            <Text weight="medium">Toy playground</Text>
            <Button size="sm" onPress={() => setPanel("output")}>
              <Play aria-hidden="true" />
              Run
            </Button>
          </Inline>
        }
        status={
          <StatusBar
            problems={problemCounts(PROBLEMS)}
            onProblemsClick={() => setPanel("problems")}
            cursor={{ line: 1, column: 1 }}
            language="Toy"
          />
        }
      >
        <ResizablePanelGroup orientation="vertical">
          <ResizablePanel id="editor" defaultSize={60} minSize={20}>
            <CodeEditor
              class={place.fill}
              label="main.toy"
              value={code()}
              onChange={setCode}
              minHeight="100%"
              maxHeight="100%"
            />
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel id="panel" defaultSize={40} minSize={15}>
            {panel() === "problems" ? (
              <ProblemsPanel class={place.fill} problems={PROBLEMS} />
            ) : (
              <ConsoleLogView
                class={place.fill}
                entries={OUTPUT}
                height="100%"
                aria-label="Output"
              />
            )}
          </ResizablePanel>
        </ResizablePanelGroup>
      </Workbench>
    </div>
  );
}
