import { createServerFn } from "@barqjs/start";

import { MEMBERS, PROJECTS } from "../data/people.ts";

export interface EntityHit {
  readonly id: string;
  readonly label: string;
  readonly description: string;
}

export interface EntityPage {
  readonly results: readonly EntityHit[];
  readonly next?: number;
}

const PAGE = 8;

interface EntityQuery {
  query: string;
  cursor?: number;
  kind?: "people" | "projects";
}

/** People and projects in Acme's workspace whose name or email holds the query, a page at a time. */
export const searchEntities = createServerFn()
  .validator((input: EntityQuery) => ({
    query: input.query.trim().toLowerCase(),
    cursor: input.cursor ?? 0,
    kind: input.kind === "projects" ? ("projects" as const) : ("people" as const),
  }))
  .handler(async ({ data }): Promise<EntityPage> => {
    // A real directory answers in tens of milliseconds; enough to see the loading row.
    await new Promise((resolve) => setTimeout(resolve, 250));
    const all: EntityHit[] =
      data.kind === "projects"
        ? PROJECTS.map((project) => ({
            id: project.id,
            label: project.name,
            description: project.key,
          }))
        : MEMBERS.map((member) => ({
            id: member.id,
            label: member.name,
            description: `${member.role}, ${member.team} · ${member.email}`,
          }));
    const hits = all.filter(
      (hit) =>
        hit.label.toLowerCase().includes(data.query) ||
        hit.description.toLowerCase().includes(data.query),
    );
    const page = hits.slice(data.cursor, data.cursor + PAGE);
    const next = data.cursor + PAGE < hits.length ? data.cursor + PAGE : undefined;
    return next === undefined ? { results: page } : { results: page, next };
  });
