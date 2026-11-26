import { createSignal, onCleanup } from "@barqjs/core";
import {
  Button,
  Inline,
  Stack,
  StatusBar,
  StatusBarItem,
  type StatusTask,
  Text,
  problemCounts,
} from "@barqjs/arc";
import { GitBranch } from "@barqjs/lucide/icons/git-branch";
import { Wifi } from "@barqjs/lucide/icons/wifi";

import { PROBLEMS } from "./data.ts";

export default function StatusBarExample() {
  const [progress, setProgress] = createSignal(0.15);
  const [indexing, setIndexing] = createSignal(true);
  const [said, setSaid] = createSignal("");
  const timer = setInterval(() => setProgress((now) => (now >= 1 ? 0 : now + 0.05)), 400);
  onCleanup(() => clearInterval(timer));
  function tasks(): StatusTask[] {
    return [
      ...(indexing() ? [{ id: "index", label: "Indexing the workspace" }] : []),
      { id: "build", label: "Building to wasm", progress: progress() },
    ];
  }
  return (
    <Stack gap={4}>
      <StatusBar
        start={
          <StatusBarItem>
            <GitBranch aria-hidden="true" />
            main
          </StatusBarItem>
        }
        end={
          <>
            <StatusBarItem priority="low">UTF-8</StatusBarItem>
            <StatusBarItem label="Language server connected" priority="low">
              <Wifi aria-hidden="true" />
            </StatusBarItem>
          </>
        }
        problems={problemCounts(PROBLEMS)}
        onProblemsClick={() => setSaid("Opened the problems panel")}
        tasks={tasks()}
        cursor={{ line: 12, column: 5, selected: 14 }}
        language="Toy"
        onLanguageClick={() => setSaid("Opened the language picker")}
      />
      <Inline gap={2}>
        <Button size="sm" variant="outline" onPress={() => setIndexing(!indexing())}>
          {indexing() ? "Finish indexing" : "Index again"}
        </Button>
        <div role="status">
          <Text size="sm" color="muted">
            {said()}
          </Text>
        </div>
      </Inline>
      <StatusBar
        problems={{ error: 0, warning: 0 }}
        cursor={{ line: 1, column: 1 }}
        language="JSON"
      />
    </Stack>
  );
}
