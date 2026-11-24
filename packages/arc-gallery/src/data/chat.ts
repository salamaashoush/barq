import type { ChatMessage, ChatPerson } from "@barqjs/arc/chat";

export const ME: ChatPerson = { id: "member-1", name: "Salama", presence: "online" };

export const TEAM: readonly ChatPerson[] = [
  ME,
  { id: "member-2", name: "Lina", presence: "online" },
  { id: "member-3", name: "Omar", presence: "away" },
  { id: "member-4", name: "Maya", presence: "dnd" },
  { id: "member-5", name: "Jonas", presence: "offline" },
  { id: "member-6", name: "Nour", presence: "online" },
];

const LINES = [
  "Morning! Standup in ten.",
  "The billing migration finished overnight, no errors in the logs.",
  "Can someone review the onboarding copy before Friday?",
  "api-gateway v2.4.1 is rolling out to eu-west-1 now.",
  "Error rate on checkout is back under 0.1%.",
  "I moved the design review to Thursday at 14:00.",
  "Does anyone know who owns the status page DNS?",
  "Pushed a fix for the invoice rounding bug.",
  "Lunch?",
  "The SSO docs for Acme Enterprise are live.",
  "Heads up: the staging database restarts at 18:00.",
  "Nice work on the search relevance numbers!",
  "I'll take the on-call handover this week.",
  "Draft of the Q4 roadmap is in the shared folder.",
  "Customer asked for annual billing again, adding it to the backlog.",
  "Retro notes are up, please add yours.",
  "Who has the Figma link for the new settings page?",
  "Shipping the dark mode tokens after lunch.",
];

const REACTIONS = ["👍", "🎉", "❤️", "👀", "🚀", "😄"];

/** A number from a seed, the same on the server and in the browser. */
const pick = (seed: number, length: number): number =>
  (Math.abs(Math.sin(seed * 9301 + 49297) * 233280) % length) | 0;

const HOUR = 3_600_000;
const MINUTE = 60_000;

/**
 * #design's history: `count` messages over the days before `now`, with
 * pictures, files, reactions, threads and edits. Times are counted back from
 * the start of the hour, so a server and the browser hydrating its page
 * write the same clock times.
 */
export function designHistory(now: number, count = 360): ChatMessage[] {
  const anchor = Math.floor(now / HOUR) * HOUR;
  const out: ChatMessage[] = [];
  for (let index = 0; index < count; index++) {
    const age = count - index;
    const createdAt = new Date(anchor - age * 37 * MINUTE).toISOString();
    const author = TEAM[pick(index, TEAM.length)] ?? ME;
    const message: ChatMessage = {
      id: `design-${index}`,
      author,
      createdAt,
      body: LINES[pick(index + 7, LINES.length)],
    };
    if (index % 17 === 5) {
      message.attachments = [
        {
          id: `image-${index}`,
          kind: "image",
          name: "office-mockup.svg",
          url: "/acme-office.svg",
          alt: "A mockup of Acme's office",
        },
      ];
    }
    if (index % 29 === 11) {
      message.attachments = [
        {
          id: `file-${index}`,
          kind: "file",
          name: "q4-roadmap.svg",
          url: "/acme-office.svg",
          size: 48_213,
          mimeType: "image/svg+xml",
        },
      ];
    }
    if (index % 5 === 2) {
      const emoji = REACTIONS[pick(index, REACTIONS.length)] ?? "👍";
      message.reactions = [{ emoji, count: 1 + pick(index + 3, 4), reacted: index % 10 === 2 }];
    }
    if (index % 31 === 9) {
      message.thread = {
        count: 3,
        participants: [{ name: "Lina" }, { name: "Omar" }],
        lastReplyAt: new Date(anchor - (age - 1) * 37 * MINUTE + 12 * MINUTE).toISOString(),
      };
    }
    if (index % 41 === 7) message.editedAt = createdAt;
    if (index % 53 === 13) message.pinned = true;
    out.push(message);
  }
  out.push(
    {
      id: "design-pending",
      author: ME,
      createdAt: new Date(anchor - 2 * MINUTE).toISOString(),
      body: "Uploading the final logo files now.",
      state: "pending",
    },
    {
      id: "design-failed",
      author: ME,
      createdAt: new Date(anchor - MINUTE).toISOString(),
      body: "Link to the brand guidelines: example.com/brand",
      state: "failed",
      error: "The network dropped before it was sent.",
    },
  );
  return out;
}

/** The replies under a message of #design. */
export function threadReplies(parent: ChatMessage): ChatMessage[] {
  const at = new Date(parent.createdAt).getTime();
  return [
    {
      id: `${parent.id}-r1`,
      author: TEAM[1] ?? ME,
      createdAt: new Date(at + 4 * MINUTE).toISOString(),
      body: "I can take a look this afternoon.",
    },
    {
      id: `${parent.id}-r2`,
      author: TEAM[2] ?? ME,
      createdAt: new Date(at + 9 * MINUTE).toISOString(),
      body: "Same, ping me when it is ready.",
    },
    {
      id: `${parent.id}-r3`,
      author: TEAM[1] ?? ME,
      createdAt: new Date(at + 12 * MINUTE).toISOString(),
      body: "Done, left two comments.",
    },
  ];
}
