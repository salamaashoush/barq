import { createSignal } from "@barqjs/core";
import { Button, Inline, PresenceStatus } from "@barqjs/arc";
import { CustomStatusDialog } from "@barqjs/arc/chat";
import type { CustomStatus } from "@barqjs/arc";

export default function CustomStatusExample() {
  const [status, setStatus] = createSignal<CustomStatus | undefined>({
    emoji: "🎧",
    text: "Heads down",
  });
  return (
    <Inline gap={4}>
      <PresenceStatus presence="online" status={status()} />
      <CustomStatusDialog
        trigger={
          <Button variant="outline" size="sm">
            Set a status
          </Button>
        }
        status={status()}
        presets={[
          { emoji: "📅", text: "In a meeting", clearAfter: "1h" },
          { emoji: "🚌", text: "Commuting", clearAfter: "30m" },
          { emoji: "🤒", text: "Out sick", clearAfter: "today" },
          { emoji: "🌴", text: "On leave", clearAfter: "week" },
        ]}
        onSave={(next) => {
          setStatus(next);
        }}
        onClear={() => {
          setStatus(undefined);
        }}
      />
    </Inline>
  );
}
