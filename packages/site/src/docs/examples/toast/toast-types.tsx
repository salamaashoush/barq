import { css } from "@barqjs/css";
import { Button } from "@barqjs/ui";
import { Toaster, createToastManager } from "@barqjs/ui/toast";

const toast = createToastManager();

const row = css`
  display: flex;
  flex-wrap: wrap;
  gap: calc(var(--spacing) * 2);
`;

export default function ToastTypes() {
  return (
    <div class={row}>
      <Toaster toastManager={toast} />
      <Button
        variant="outline"
        onPress={() => toast.add({ description: "Event has been created." })}
      >
        Default
      </Button>
      <Button
        variant="outline"
        onPress={() => toast.add({ type: "success", description: "Event has been created." })}
      >
        Success
      </Button>
      <Button
        variant="outline"
        onPress={() =>
          toast.add({ type: "info", description: "Arrive 10 minutes before the event." })
        }
      >
        Info
      </Button>
      <Button
        variant="outline"
        onPress={() =>
          toast.add({ type: "warning", description: "The event cannot start before 8:00 AM." })
        }
      >
        Warning
      </Button>
      <Button
        variant="outline"
        onPress={() =>
          toast.add({
            type: "error",
            description: "The event could not be created.",
            priority: "high",
          })
        }
      >
        Error
      </Button>
    </div>
  );
}
