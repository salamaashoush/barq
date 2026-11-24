import { createSignal } from "@barqjs/core";
import { type EntityOption, EntityPicker, Grid, Text } from "@barqjs/arc";

import { searchEntities } from "../../server/entities.ts";

const people = (query: string, context: { signal: AbortSignal; cursor?: unknown }) =>
  searchEntities({
    data: {
      query,
      cursor: typeof context.cursor === "number" ? context.cursor : 0,
      kind: "people",
    },
    signal: context.signal,
  });

const projects = (query: string, context: { signal: AbortSignal; cursor?: unknown }) =>
  searchEntities({
    data: {
      query,
      cursor: typeof context.cursor === "number" ? context.cursor : 0,
      kind: "projects",
    },
    signal: context.signal,
  });

export default function EntityPickerExample() {
  const [owner, setOwner] = createSignal<EntityOption | null>(null);
  const [reviewers, setReviewers] = createSignal<readonly EntityOption[]>([
    { id: "member-2", label: "Lina", description: "Designer, Design · lina@example.com" },
  ]);

  return (
    <Grid columns={{ base: 1, cqMd: 2 }} gap={6}>
      <EntityPicker
        label="Owner"
        description="One person, searched as you type, eight at a time."
        placeholder="Search people"
        search={people}
        value={owner()}
        onChange={setOwner}
      />
      <EntityPicker
        multiple
        label="Reviewers"
        description="Up to three."
        placeholder="Add reviewers"
        max={3}
        search={people}
        value={reviewers()}
        onChange={setReviewers}
      />
      <EntityPicker
        label="Project"
        placeholder="Find or create a project"
        search={projects}
        avatars={false}
        onCreate={(name) =>
          new Promise<EntityOption>((resolve) =>
            setTimeout(
              () => resolve({ id: `project-${name}`, label: name, description: "New project" }),
              400,
            ),
          )
        }
      />
      <EntityPicker
        label="Approver"
        placeholder="Search people"
        search={people}
        isRequired
        minLength={2}
        errorMessage="Choose who approves the release."
      />
      <EntityPicker
        label="Escalation contact"
        search={people}
        defaultValue={{ id: "member-3", label: "Omar" }}
        isDisabled
      />
      <Text size="sm" color="muted">
        Owner: {owner()?.label ?? "none"} · Reviewers:{" "}
        {reviewers()
          .map((one) => one.label)
          .join(", ")}
      </Text>
    </Grid>
  );
}
