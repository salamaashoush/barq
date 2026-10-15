import { css } from "@barqjs/css";
import { Button, toast } from "@barqjs/ui";

const fit = css`
  width: fit-content;
`;

export default function SonnerDescription() {
  return (
    <Button
      onPress={() =>
        toast("Event has been created", {
          description: "Monday, January 3rd at 6:00pm",
        })
      }
      variant="outline"
      class={fit}
    >
      Show Toast
    </Button>
  );
}
