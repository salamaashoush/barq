import { createSignal } from "@barqjs/core";
import { Button, Inline, Stack, Switch, Label, Text, toast } from "@barqjs/arc";
import {
  type DiagramEditorApi,
  DiagramEditor,
  exportToBlob,
  exportToSvg,
  serializeAsJSON,
} from "@barqjs/diagram";

import { acmeArchitecture } from "../../data/architecture.ts";

function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function DiagramEditorExample() {
  const [grid, setGrid] = createSignal(false);
  const [viewOnly, setViewOnly] = createSignal(false);
  const [count, setCount] = createSignal(0);
  let editor: DiagramEditorApi | undefined;

  function scene() {
    return {
      elements: editor?.getSceneElements() ?? [],
      appState: { ...editor?.getAppState(), exportBackground: true },
      files: editor?.getFiles() ?? {},
    };
  }

  return (
    <Stack gap={3}>
      <Inline gap={2} align="center" wrap>
        <Button
          variant="outline"
          size="sm"
          onPress={() => editor?.setActiveTool({ type: "rectangle" })}
        >
          Rectangle
        </Button>
        <Button
          variant="outline"
          size="sm"
          onPress={() => editor?.setActiveTool({ type: "arrow" })}
        >
          Arrow
        </Button>
        <Button variant="outline" size="sm" onPress={() => editor?.scrollToContent()}>
          Zoom to fit
        </Button>
        <Button
          variant="outline"
          size="sm"
          onPress={() =>
            void (async () => {
              const svg = await exportToSvg({ ...scene(), exportPadding: 24 });
              download(
                new Blob([svg.outerHTML], { type: "image/svg+xml" }),
                "acme-architecture.svg",
              );
            })()
          }
        >
          Export SVG
        </Button>
        <Button
          variant="outline"
          size="sm"
          onPress={() =>
            void (async () => {
              const { elements, appState, files } = scene();
              const png = await exportToBlob({
                elements,
                appState: { ...appState, exportScale: 2 },
                files,
                mimeType: "image/png",
                exportPadding: 24,
              });
              download(png, "acme-architecture.png");
            })()
          }
        >
          Export PNG
        </Button>
        <Button
          variant="outline"
          size="sm"
          onPress={() => {
            const { elements, appState, files } = scene();
            const json = serializeAsJSON(elements, appState, files, "local");
            toast.success("Scene saved", {
              description: `${Math.round(json.length / 1024)} KB of .excalidraw JSON`,
            });
          }}
        >
          Save as JSON
        </Button>
        <Inline gap={2} align="center">
          <Switch id="diagram-grid" checked={grid()} onCheckedChange={setGrid} />
          <Label for="diagram-grid">Grid</Label>
        </Inline>
        <Inline gap={2} align="center">
          <Switch id="diagram-view" checked={viewOnly()} onCheckedChange={setViewOnly} />
          <Label for="diagram-view">View only</Label>
        </Inline>
      </Inline>
      <DiagramEditor
        label="Acme architecture"
        initialData={acmeArchitecture()}
        height={480}
        gridModeEnabled={grid()}
        viewModeEnabled={viewOnly()}
        api={(api) => {
          editor = api;
        }}
        onInitialize={(api) => api.scrollToContent()}
        onChange={(elements) => setCount(elements.filter((element) => !element.isDeleted).length)}
      />
      <Text size="xs" color="muted" numeric>
        {count()} elements
      </Text>
    </Stack>
  );
}
