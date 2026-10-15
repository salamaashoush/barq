import { Button, toast } from "@barqjs/ui";

export default function SonnerDemo() {
  return (
    <Button
      variant="outline"
      onPress={() =>
        toast("Event has been created", {
          description: "Sunday, December 03, 2023 at 9:00 AM",
          action: {
            label: "Undo",
            onClick: () => {
              toast("Event creation undone");
            },
          },
        })
      }
    >
      Show Toast
    </Button>
  );
}
