import type { EntityOption } from "@barqjs/arc";

/** What "now" is for every example here, so the server and the page agree on "Today". */
export const NOW = "2026-03-04T12:00:00.000Z";

export const PEOPLE: readonly EntityOption[] = [
  { id: "u1", label: "Salama Ashoush", description: "salama@example.com" },
  { id: "u2", label: "Ana Lima", description: "ana@example.com" },
  { id: "u3", label: "Ben Okafor", description: "ben@example.com" },
  { id: "u4", label: "Chen Wu", description: "chen@example.com" },
  { id: "u5", label: "Dina Saad", description: "dina@example.com" },
  { id: "u6", label: "Farah Nasser", description: "farah@example.com" },
];

/** A people search as a server would answer it: a moment later, matching the name or email. */
export async function findPeople(query: string): Promise<EntityOption[]> {
  await new Promise((resolve) => setTimeout(resolve, 150));
  const words = query.toLocaleLowerCase();
  return PEOPLE.filter(
    (person) =>
      person.label.toLocaleLowerCase().includes(words) ||
      (person.description ?? "").includes(words),
  );
}
