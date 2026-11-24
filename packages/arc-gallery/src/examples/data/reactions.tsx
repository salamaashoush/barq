import { createSignal } from "@barqjs/core";
import { type Reaction, ReactionBar, Stack, Text } from "@barqjs/arc";

export default function Reactions() {
  const [reactions, setReactions] = createSignal<Reaction[]>([
    { emoji: "🎉", count: 4, reacted: true, label: "Salama, Lina and 2 others" },
    { emoji: "👀", count: 2, label: "Omar and Maya" },
    { emoji: "🚀", count: 1, label: "Jonas" },
  ]);

  const react = (emoji: string, add: boolean) =>
    setReactions((all) => {
      const found = all.find((each) => each.emoji === emoji);
      if (found === undefined)
        return add ? [...all, { emoji, count: 1, reacted: true, label: "Salama" }] : all;
      return all
        .map((each) =>
          each.emoji === emoji
            ? { ...each, count: each.count + (add ? 1 : -1), reacted: add }
            : each,
        )
        .filter((each) => each.count > 0);
    });

  return (
    <Stack gap={4}>
      <Stack gap={2}>
        <Text size="sm" weight="medium">
          Toggle one, or add from the menu
        </Text>
        <ReactionBar reactions={reactions()} onReact={react} />
      </Stack>
      <Stack gap={2}>
        <Text size="sm" weight="medium">
          Read-only
        </Text>
        <ReactionBar
          reactions={[
            { emoji: "👍", count: 12, label: "12 people" },
            { emoji: "❤️", count: 3, label: "3 people" },
          ]}
        />
      </Stack>
    </Stack>
  );
}
