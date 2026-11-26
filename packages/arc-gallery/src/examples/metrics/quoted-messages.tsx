import { Hash } from "@barqjs/lucide/icons/hash";
import { X } from "@barqjs/lucide/icons/x";
import { IconButton, Stack } from "@barqjs/arc";
import { QuotedMessageCard } from "@barqjs/arc/chat";

export default function QuotedMessages() {
  return (
    <Stack gap={3}>
      <QuotedMessageCard
        author={{ name: "Ana Lima" }}
        sentAt="2026-11-24T09:12:00Z"
        source={{ label: "design", href: "#design", icon: <Hash /> }}
        href="#message-1"
        footer="Pinned by Salama Ashoush"
        actions={
          <IconButton label="Unpin" size="sm">
            <X />
          </IconButton>
        }
      >
        The new chart marks are in. Check the dashed p95 and the budget line in dark mode before
        Friday, and tell me if the failed-run dots read on a phone.
      </QuotedMessageCard>
      <QuotedMessageCard
        author={{ name: "Salama Ashoush" }}
        sentAt="2026-11-22T16:40:00Z"
        source={{ label: "release-notes", icon: <Hash /> }}
        note="Quote this in the changelog."
        footer="Saved on 22 November"
      >
        Every meter now says its reading in words, so the bar is never the only way to read it.
      </QuotedMessageCard>
      <QuotedMessageCard author={{ name: "Loading" }} sentAt="2026-11-22T16:40:00Z" loading />
    </Stack>
  );
}
