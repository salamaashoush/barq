export interface Member {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly role: string;
  readonly team: string;
}

const FIRST = [
  "Salama",
  "Lina",
  "Omar",
  "Maya",
  "Jonas",
  "Nour",
  "Elena",
  "Karim",
  "Sofia",
  "Tariq",
  "Hana",
  "Leo",
];
const TEAMS = ["Platform", "Payments", "Design", "Support", "Growth", "Security"];
const ROLES = [
  "Engineer",
  "Designer",
  "Product manager",
  "Support lead",
  "Analyst",
  "Engineering manager",
];

/** Seventy-two members of Acme's workspace, the same on every run. */
export const MEMBERS: readonly Member[] = Array.from({ length: 72 }, (_, index) => {
  const first = FIRST[index % FIRST.length] ?? "Salama";
  const n = Math.floor(index / FIRST.length);
  const name = n === 0 ? first : `${first} ${String.fromCharCode(65 + n)}.`;
  return {
    id: `member-${index + 1}`,
    name,
    email: `${first.toLowerCase()}${n === 0 ? "" : n}@example.com`,
    role: ROLES[index % ROLES.length] ?? "Engineer",
    team: TEAMS[(index * 7) % TEAMS.length] ?? "Platform",
  };
});

export const PROJECTS: readonly {
  readonly id: string;
  readonly name: string;
  readonly key: string;
}[] = [
  "Billing revamp",
  "Mobile onboarding",
  "Status page",
  "Search relevance",
  "Data warehouse",
  "SSO for Acme Enterprise",
  "Design tokens",
  "Incident runbooks",
].map((name, index) => ({ id: `project-${index + 1}`, name, key: `ACM-${100 + index}` }));
