import { css } from "@barqjs/css";
import { Button, toast } from "@barqjs/ui";

const row = css`
  display: flex;
  flex-wrap: wrap;
  gap: calc(var(--spacing) * 2);
`;

export default function SonnerTypes() {
  return (
    <div class={row}>
      <Button variant="outline" onPress={() => toast("Event has been created")}>
        Default
      </Button>
      <Button variant="outline" onPress={() => toast.success("Event has been created")}>
        Success
      </Button>
      <Button
        variant="outline"
        onPress={() => toast.info("Be at the area 10 minutes before the event time")}
      >
        Info
      </Button>
      <Button
        variant="outline"
        onPress={() => toast.warning("Event start time cannot be earlier than 8am")}
      >
        Warning
      </Button>
      <Button variant="outline" onPress={() => toast.error("Event has not been created")}>
        Error
      </Button>
      <Button
        variant="outline"
        onPress={() => {
          void toast.promise<{ name: string }>(
            () => new Promise((resolve) => setTimeout(() => resolve({ name: "Event" }), 2000)),
            {
              loading: "Loading...",
              success: (data: { name: string }) => `${data.name} has been created`,
              error: "Error",
            },
          );
        }}
      >
        Promise
      </Button>
    </div>
  );
}
