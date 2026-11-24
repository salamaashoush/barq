import type { CommentPerson, CommentThreadData } from "@barqjs/arc";

import { MEMBERS } from "./people.ts";

export const SALAMA: CommentPerson = { id: "member-1", name: "Salama", presence: "online" };
export const LINA: CommentPerson = { id: "member-2", name: "Lina", presence: "away" };
export const OMAR: CommentPerson = { id: "member-3", name: "Omar" };
export const MAYA: CommentPerson = { id: "member-4", name: "Maya" };

/** Everyone `@` offers in a comment. */
export const MENTIONABLE: readonly CommentPerson[] = MEMBERS.slice(0, 24).map((member) => ({
  id: member.id,
  name: member.name,
}));

const MINUTE = 60_000;

/** The comments on Acme's onboarding spec, timed back from `now`. */
export function specThreads(now: number): CommentThreadData[] {
  function at(minutes: number): string {
    return new Date(now - minutes * MINUTE).toISOString();
  }
  return [
    {
      id: "thread-1",
      anchor: { id: "intro", quote: "New workspaces start on the 14-day trial" },
      comments: [
        {
          id: "c-1",
          author: LINA,
          body: "@Salama should the trial start when the workspace is created or when the first member joins?",
          mentions: [SALAMA],
          createdAt: at(180),
          reactions: [{ emoji: "👀", count: 2, label: "Omar and Maya" }],
        },
        {
          id: "c-2",
          author: SALAMA,
          body: "When the first member joins. Otherwise a workspace made by sales burns its trial before anyone logs in.",
          createdAt: at(150),
          editedAt: at(140),
          reactions: [{ emoji: "👍", count: 3, reacted: true, label: "You, Lina and Omar" }],
        },
        {
          id: "c-3",
          author: OMAR,
          body: "Agreed. I'll add a `trial_started_at` column to the billing plan.",
          createdAt: at(32),
          unread: true,
        },
      ],
    },
    {
      id: "thread-2",
      anchor: { id: "pricing", quote: "Seats are billed monthly in arrears" },
      comments: [
        {
          id: "c-4",
          author: MAYA,
          body: "Finance asked for annual billing too. Is that in scope for this release?",
          createdAt: at(95),
        },
      ],
    },
    {
      id: "thread-3",
      anchor: { id: "sso", label: "SSO section", detached: true },
      resolved: true,
      comments: [
        {
          id: "c-5",
          author: OMAR,
          body: "The SAML screenshots are out of date.",
          createdAt: at(60 * 26),
        },
        {
          id: "c-6",
          author: SALAMA,
          body: "Replaced them with the new admin console.",
          createdAt: at(60 * 25),
        },
      ],
    },
  ];
}
