import { createSignal } from "@barqjs/core";
import { Grid, Stack, Text } from "@barqjs/arc";
import {
  BlockEditor,
  RichTextRenderer,
  type SharedBlockSource,
  type SharedBlockViewProps,
  markdownToDocument,
  sharedBlockExtension,
} from "@barqjs/arc/editor";

const KEPT: Readonly<Record<string, string>> = {
  "support-hours": "**Support hours:** 08:00 to 18:00 UTC, Monday to Friday.",
  "escalation-contacts": "Escalate to the on-call lead, then to the platform owner.",
};

function KeptBlock(props: SharedBlockViewProps) {
  return (
    <RichTextRenderer size="sm" markdown={KEPT[props.id] ?? "This shared block was removed."} />
  );
}

function part(title: string, body: string): string {
  return `<header>${title}</header>\n\n${body}\n`;
}

function set(layout: string, parts: readonly string[]): string {
  return [`<section data-panels="${layout}">`, ...parts, "</section>"].join("\n");
}

const TABS = set("tabs", [
  part("Web", "Sign in at **acme.example.com** with your work account."),
  part("Mobile", "Install the Acme app and scan the code on your profile page."),
]);

const STEPS = set("steps", [
  part("Request access", "Ask your lead to add you to the workspace."),
  part("Set up two-step sign-in", "Use an authenticator app, not text messages."),
  part("Join the channels", "Start with #announcements and your team's room."),
]);

const TIMELINE = set("timeline", [
  part("Day 1", "Laptop, accounts and a tour of the office."),
  part("Week 1", "Pair with a teammate on a small change."),
  part("Month 1", "Own a feature end to end."),
]);

const CARDS = set("cards", [
  part("SLA", "Service level agreement: what we promise customers."),
  part("RFC", "Request for comments: a written proposal before a large change."),
]);

const CHOICES = set("choices", [
  part("The deploy failed", "Roll back from the release page, then open an incident."),
  part("The deploy is slow", "Check the queue on the build dashboard before retrying."),
]);

const SHARED = '<div data-shared-block="support-hours"></div>';

const GUIDE = [
  "# Onboarding guide",
  "Type `/` and choose Tabs, Steps, Timeline, Flip cards or Choices. Enter goes from a title to its body, an empty last line starts the next part, and Enter on an empty last title leaves the set. The grip's menu shows a set another way, keeping every part, and adds one.",
  TABS,
  STEPS,
  TIMELINE,
  CARDS,
  CHOICES,
  SHARED,
  "Choose a block's grip, then Keep as a shared block, to keep it once and show it anywhere.",
].join("\n\n");

export default function PanelsAndShared() {
  const [kept, setKept] = createSignal(0);
  const [edited, setEdited] = createSignal<string | null>(null);
  const source: SharedBlockSource = {
    View: KeptBlock,
    choose: () => Promise.resolve("escalation-contacts"),
    keep: (content) => {
      setKept(kept() + 1);
      return Promise.resolve(content.root.children.length > 0 ? "support-hours" : null);
    },
    edit: (id) => setEdited(id),
    read: (id) => Promise.resolve(markdownToDocument(KEPT[id] ?? "")),
  };
  const extensions = [sharedBlockExtension({ source })];
  return (
    <Stack gap={6}>
      <BlockEditor label="Onboarding guide" defaultMarkdown={GUIDE} extensions={extensions} />
      <Text size="sm" color="muted">
        {edited() === null
          ? `Blocks kept this visit: ${String(kept())}.`
          : `Opened the shared block ${edited() ?? ""} to edit everywhere.`}
      </Text>
      <Grid columns={{ base: 1, cqLg: 2 }} gap={6}>
        <Stack gap={2}>
          <Text size="sm" weight="medium">
            Read: tabs, steps and a timeline
          </Text>
          <RichTextRenderer
            markdown={[TABS, STEPS, TIMELINE].join("\n\n")}
            extensions={extensions}
          />
        </Stack>
        <Stack gap={2}>
          <Text size="sm" weight="medium">
            Read: flip cards, choices and a shared block
          </Text>
          <RichTextRenderer
            markdown={[CARDS, CHOICES, SHARED].join("\n\n")}
            extensions={extensions}
          />
        </Stack>
      </Grid>
    </Stack>
  );
}
