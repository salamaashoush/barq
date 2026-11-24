import { createSignal } from "@barqjs/core";
import { Button, Inline, Stack, Text } from "@barqjs/arc";
import { type DiagramViewerApi, DiagramViewer } from "@barqjs/diagram";

import { acmeArchitecture } from "../../data/architecture.ts";

export default function DiagramViewerExample() {
  const [zoom, setZoom] = createSignal<number | null>(null);
  let viewer: DiagramViewerApi | undefined;
  const track = (): void => {
    setZoom(Math.round((viewer?.getAppState().zoom.value ?? 1) * 100));
  };

  return (
    <Stack gap={3}>
      <Inline gap={2} align="center" wrap>
        <Button
          variant="outline"
          size="sm"
          onPress={() => {
            viewer?.zoomIn();
            track();
          }}
        >
          Zoom in
        </Button>
        <Button
          variant="outline"
          size="sm"
          onPress={() => {
            viewer?.zoomOut();
            track();
          }}
        >
          Zoom out
        </Button>
        <Button
          variant="outline"
          size="sm"
          onPress={() => {
            viewer?.resetZoom();
            track();
          }}
        >
          100%
        </Button>
        <Button
          variant="outline"
          size="sm"
          onPress={() => {
            viewer?.scrollToContent();
            track();
          }}
        >
          Fit
        </Button>
        <Text size="sm" color="muted" numeric>
          {zoom() === null ? "Fitted to the scene" : `${zoom()}%`}
        </Text>
      </Inline>
      <DiagramViewer
        scene={acmeArchitecture()}
        label="Acme architecture, read-only"
        height={320}
        padding={24}
        api={(api) => {
          viewer = api;
        }}
      />
      <Text size="sm" color="muted">
        Drag to pan, Ctrl or Cmd with the wheel to zoom, and the arrow keys, + and − once it has
        focus.
      </Text>
    </Stack>
  );
}
