import { createSignal } from "@barqjs/core";
import { Button, Inline, Stack, Text, toast } from "@barqjs/arc";

export default function Toasts() {
  const [undone, setUndone] = createSignal(0);
  return (
    <Stack gap={3}>
      <Inline gap={2} wrap>
        <Button variant="outline" onPress={() => toast("Draft saved")}>
          Default
        </Button>
        <Button
          variant="outline"
          onPress={() => toast.success("Invoice #1042 sent to salama@example.com")}
        >
          Success
        </Button>
        <Button variant="outline" onPress={() => toast.info("Maya joined the project")}>
          Info
        </Button>
        <Button variant="outline" onPress={() => toast.warning("You are near your API quota")}>
          Warning
        </Button>
        <Button variant="outline" onPress={() => toast.error("The export could not start")}>
          Error
        </Button>
        <Button
          variant="outline"
          onPress={() =>
            toast("Project archived", {
              description: "Acme Cloud moves to the archive.",
              action: { label: "Undo", onAction: () => setUndone(undone() + 1) },
            })
          }
        >
          With an action
        </Button>
        <Button
          variant="outline"
          onPress={() => {
            void toast.promise<{ rows: number }>(
              () => new Promise((resolve) => setTimeout(() => resolve({ rows: 1284 }), 1500)),
              {
                loading: "Importing customers…",
                success: (data: { rows: number }) => `Imported ${String(data.rows)} customers`,
                error: "The import failed",
              },
            );
          }}
        >
          Promise
        </Button>
      </Inline>
      <Text size="sm" color="muted">
        Undone {undone()} times. The stack comes from ArcProvider.
      </Text>
    </Stack>
  );
}
