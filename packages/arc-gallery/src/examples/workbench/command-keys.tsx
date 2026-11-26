import { createSignal } from "@barqjs/core";
import {
  Button,
  CommandMenu,
  Inline,
  Stack,
  Text,
  openCommandMenu,
  useCommands,
} from "@barqjs/arc";

export default function CommandKeys() {
  const [last, setLast] = createSignal("Nothing yet");
  useCommands(() => [
    {
      heading: "Run",
      actions: [
        { label: "Run the program", keys: "mod+enter", onSelect: () => setLast("Ran the program") },
        { label: "Run the tests", keys: "mod+shift+t", onSelect: () => setLast("Ran the tests") },
        { label: "Format the file", keys: "shift+alt+f", onSelect: () => setLast("Formatted") },
      ],
    },
    {
      heading: "Go to",
      actions: [
        { label: "Problems", keys: "g p", onSelect: () => setLast("Went to the problems") },
        { label: "Tests", keys: "g t", onSelect: () => setLast("Went to the tests") },
      ],
    },
  ]);
  return (
    <Stack gap={3}>
      <CommandMenu shortcut={false} bindKeys />
      <Inline gap={3}>
        <Button variant="outline" onPress={() => openCommandMenu()}>
          Open the commands
        </Button>
        <div role="status">
          <Text size="sm" color="muted">
            {last()}
          </Text>
        </div>
      </Inline>
      <Text size="sm" color="muted">
        Press G then P, or Mod+Shift+T, anywhere on this page.
      </Text>
    </Stack>
  );
}
