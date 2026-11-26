import {
  EmptyState,
  List,
  ListDetailLayout,
  ListItem,
  PersonAvatar,
  Stack,
  Text,
  useSearchParam,
} from "@barqjs/arc";
import { layer } from "@barqjs/css";
import { Inbox } from "@barqjs/lucide/icons/inbox";

const demo = layer("demo");
const frame = demo({ height: "32rem" });
const reading = demo({ padding: "1rem" });

interface Thread {
  id: string;
  from: string;
  subject: string;
  preview: string;
  at: string;
}

const THREADS: readonly Thread[] = [
  {
    id: "t-1",
    from: "Lina",
    subject: "Field trip consent",
    preview: "The forms are due on Thursday, can you remind the parents?",
    at: "09:12",
  },
  {
    id: "t-2",
    from: "Omar",
    subject: "Grade 7 timetable",
    preview: "Science moves to the second period from next week.",
    at: "Yesterday",
  },
  {
    id: "t-3",
    from: "Maya",
    subject: "Invoice INV-1043",
    preview: "Payment went through this morning, thank you.",
    at: "Mon",
  },
  {
    id: "t-4",
    from: "Jonas",
    subject: "Sports day",
    preview: "We need four more volunteers for the relay.",
    at: "Sun",
  },
];

export default function ListDetailExample() {
  const thread = useSearchParam("thread", { defaultValue: "" });
  function open(): Thread | undefined {
    return THREADS.find((one) => one.id === thread.value());
  }
  return (
    <ListDetailLayout
      class={frame}
      framed
      storageKey="gallery-inbox"
      listLabel="Conversations"
      param="thread"
      list={
        <List
          aria-label="Conversations"
          items={THREADS}
          getTextValue={(one) => one.subject}
          selectionMode="single"
          selectionBehavior="replace"
          selectedKeys={thread.value() === "" ? [] : [thread.value()]}
          onSelectionChange={(keys) => {
            if (keys === "all") return;
            const [key] = keys;
            if (key !== undefined) thread.setValue(String(key));
          }}
        >
          {(one) => (
            <ListItem
              media={<PersonAvatar person={{ id: one.from, name: one.from }} size="sm" />}
              mediaVariant="default"
              title={one.subject}
              description={one.preview}
              meta={one.at}
            />
          )}
        </List>
      }
      placeholder={
        <EmptyState
          icon={<Inbox />}
          heading="Pick a conversation"
          description="Messages from families and colleagues show here."
        />
      }
    >
      <Stack gap={3} class={reading}>
        <Text size="lg" weight="strong">
          {open()?.subject}
        </Text>
        <Text size="sm" color="muted">
          From {open()?.from}, {open()?.at}
        </Text>
        <Text>{open()?.preview}</Text>
      </Stack>
    </ListDetailLayout>
  );
}
