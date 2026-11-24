import { For, createSignal } from "@barqjs/core";
import { Grid, Inline, Stack, Text } from "@barqjs/arc";
import { EmojiButton, EmojiPicker, arabicEmoji } from "@barqjs/arc/chat";

export default function Emoji() {
  const [picked, setPicked] = createSignal<readonly string[]>([]);
  const add = (emoji: string): void => {
    setPicked([...picked(), emoji].slice(-12));
  };
  return (
    <Grid columns={{ base: 1, cqLg: 2 }} gap={6}>
      <Stack gap={2}>
        <Text size="sm" weight="medium">
          EmojiPicker inline: search, categories, recently used and skin tone
        </Text>
        <EmojiPicker onSelect={add} aria-label="Pick an emoji" />
      </Stack>
      <Stack gap={3}>
        <Inline gap={2} align="center">
          <EmojiButton onSelect={add} />
          <EmojiButton onSelect={add} label="React with an emoji" variant="outline" />
          <EmojiButton onSelect={add} label="اختر رمزًا تعبيريًا" source={arabicEmoji} size="sm" />
        </Inline>
        <Text size="sm" color="muted">
          The third button searches in Arabic: try "قلب".
        </Text>
        <div role="status">
          <Text size="lg">
            <For each={picked()}>{(emoji) => <span>{emoji}</span>}</For>
          </Text>
        </div>
      </Stack>
    </Grid>
  );
}
