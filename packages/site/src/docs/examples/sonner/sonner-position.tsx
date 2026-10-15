import { css } from "@barqjs/css";
import { Button, toast } from "@barqjs/ui";

const row = css`
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: calc(var(--spacing) * 2);
`;

export default function SonnerPosition() {
  return (
    <div class={row}>
      <Button
        variant="outline"
        onPress={() => toast("Event has been created", { position: "top-left" })}
      >
        Top Left
      </Button>
      <Button
        variant="outline"
        onPress={() => toast("Event has been created", { position: "top-center" })}
      >
        Top Center
      </Button>
      <Button
        variant="outline"
        onPress={() => toast("Event has been created", { position: "top-right" })}
      >
        Top Right
      </Button>
      <Button
        variant="outline"
        onPress={() => toast("Event has been created", { position: "bottom-left" })}
      >
        Bottom Left
      </Button>
      <Button
        variant="outline"
        onPress={() => toast("Event has been created", { position: "bottom-center" })}
      >
        Bottom Center
      </Button>
      <Button
        variant="outline"
        onPress={() => toast("Event has been created", { position: "bottom-right" })}
      >
        Bottom Right
      </Button>
    </div>
  );
}
