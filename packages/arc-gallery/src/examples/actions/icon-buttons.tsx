import { For, createSignal } from "@barqjs/core";
import { IconButton, Inline, Stack, Text } from "@barqjs/arc";
import { Archive } from "@barqjs/lucide/icons/archive";
import { Pencil } from "@barqjs/lucide/icons/pencil";
import { Share2 } from "@barqjs/lucide/icons/share-2";
import { Star } from "@barqjs/lucide/icons/star";
import { Trash2 } from "@barqjs/lucide/icons/trash-2";

const SIZES = ["xs", "sm", "md", "lg"] as const;

export default function IconButtons() {
  const [starred, setStarred] = createSignal(false);
  const [archived, setArchived] = createSignal(0);
  return (
    <Stack gap={5}>
      <Inline gap={2} align="center" wrap>
        <For each={SIZES}>
          {(size) => (
            <IconButton label={`Edit, ${size}`} size={size} variant="outline">
              <Pencil />
            </IconButton>
          )}
        </For>
      </Inline>
      <Inline gap={2} align="center" wrap>
        <IconButton label="Share" shortcut="Mod+Shift+S">
          <Share2 />
        </IconButton>
        <IconButton
          label={starred() ? "Unstar" : "Star"}
          isPressed={starred()}
          onPress={() => setStarred(!starred())}
        >
          <Star />
        </IconButton>
        <IconButton
          label="Archive"
          variant="secondary"
          tooltipSide="bottom"
          onPress={() => setArchived(archived() + 1)}
        >
          <Archive />
        </IconButton>
        <IconButton label="Delete" variant="destructive">
          <Trash2 />
        </IconButton>
        <IconButton label="Delete, not allowed" variant="ghost" isDisabled>
          <Trash2 />
        </IconButton>
        <IconButton label="Edit without a tooltip" tooltip={false} variant="ghost">
          <Pencil />
        </IconButton>
      </Inline>
      <Text size="sm" color="muted">
        {starred() ? "Starred" : "Not starred"}, archived {archived()} times. Hover or focus a
        button for its name.
      </Text>
    </Stack>
  );
}
