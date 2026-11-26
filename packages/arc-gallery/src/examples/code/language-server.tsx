import { For, Show, createSignal, onSettled } from "@barqjs/core";
import {
  Button,
  Grid,
  Inline,
  OutlineView,
  SegmentedControl,
  Stack,
  Text,
  toast,
} from "@barqjs/arc";
import { CodeEditor, languageClient, symbolNodes } from "@barqjs/arc/code";

import { MAIN, SHAPES, SOURCES, startToyServer } from "./toy-server.ts";

const FILES = [
  { value: MAIN, label: "main.toy" },
  { value: SHAPES, label: "shapes.toy" },
];

const SEVERITY = ["Error", "Warning", "Info", "Hint"];

function nameOf(uri: string): string {
  return uri.slice(uri.lastIndexOf("/") + 1);
}

export default function LanguageServerExample() {
  const [active, setActive] = createSignal(MAIN);
  const [texts, setTexts] = createSignal<Readonly<Record<string, string>>>(SOURCES);
  const client = languageClient({
    transport: startToyServer,
    rootUri: "file:///project/",
    languageId: "toy",
    onNavigate: (uri) => setActive(uri),
    onEdit: (uri, text) => setTexts({ ...texts(), [uri]: text }),
    onMessage: (message) => toast(message.message),
  });
  onSettled(() => {
    for (const uri of Object.keys(SOURCES)) client.open(uri, SOURCES[uri] ?? "");
    return () => client.dispose();
  });

  function edit(uri: string, text: string): void {
    setTexts({ ...texts(), [uri]: text });
  }

  return (
    <Stack gap={3}>
      <Text size="sm">
        Hover a name, type for completion, F12 or Mod-click a call to go to its definition in either
        file, Shift-F12 for references, F2 to rename across both, Mod-. on a problem for its fix,
        and Shift-Alt-F to format.
      </Text>
      <Inline gap={3} align="center" wrap>
        <SegmentedControl
          aria-label="Open file"
          size="sm"
          items={FILES}
          value={active()}
          onChange={setActive}
        />
        <Button
          size="sm"
          variant="outline"
          onPress={() => void client.executeCommand({ title: "Check", command: "toy.check" })}
        >
          Check the project
        </Button>
        <For each={client.progress()}>
          {(task) => (
            <Text size="sm" color="muted">
              {task.title} {String(task.percentage ?? 0)}%
            </Text>
          )}
        </For>
      </Inline>
      <Grid columns={{ base: 1, cqLg: 2 }} gap={4}>
        <div>
          <For each={FILES}>
            {(file) => (
              <Show when={active() === file.value}>
                <CodeEditor
                  label={file.label}
                  language="toy"
                  folding
                  minHeight={260}
                  value={texts()[file.value] ?? ""}
                  onChange={(text) => edit(file.value, text)}
                  extensions={client.document(file.value)}
                />
              </Show>
            )}
          </For>
        </div>
        <Stack gap={3}>
          <Stack gap={1.5}>
            <Text size="sm" weight="medium">
              Outline of {nameOf(active())}
            </Text>
            <OutlineView
              aria-label={`Outline of ${nameOf(active())}`}
              guides
              nodes={symbolNodes(client.symbols(active()) ?? [])}
            />
          </Stack>
          <Stack gap={1.5}>
            <Text size="sm" weight="medium">
              Problems
            </Text>
            <For
              each={client
                .diagnostics()
                .flatMap((file) => file.diagnostics.map((one) => ({ uri: file.uri, one })))}
            >
              {(problem) => (
                <Button
                  size="sm"
                  variant="ghost"
                  onPress={() => client.navigate(problem.uri, problem.one.range)}
                >
                  {SEVERITY[(problem.one.severity ?? 1) - 1]} in {nameOf(problem.uri)}:{" "}
                  {String(problem.one.range.start.line + 1)}{" "}
                  {typeof problem.one.message === "string"
                    ? problem.one.message
                    : problem.one.message.value}
                </Button>
              )}
            </For>
          </Stack>
        </Stack>
      </Grid>
    </Stack>
  );
}
