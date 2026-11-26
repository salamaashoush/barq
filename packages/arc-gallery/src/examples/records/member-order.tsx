import { createSignal } from "@barqjs/core";
import { type EntityOption, OrderedMemberList, Stack } from "@barqjs/arc";

import { PEOPLE, findPeople } from "./data.ts";

export default function MemberOrderExample() {
  const [members, setMembers] = createSignal<readonly EntityOption[]>([
    PEOPLE[0] as EntityOption,
    PEOPLE[2] as EntityOption,
    { id: "gone", label: "" },
    PEOPLE[1] as EntityOption,
  ]);
  return (
    <Stack gap={8}>
      <OrderedMemberList
        label="Turn order"
        description="Each person is on call for a week, in this order."
        value={members()}
        onChange={setMembers}
        search={findPeople}
        max={6}
      />
      <OrderedMemberList
        label="Escalation"
        search={findPeople}
        emptyLabel="Add who is paged first."
      />
      <OrderedMemberList
        label="Reviewers"
        defaultValue={PEOPLE.slice(3, 5)}
        search={findPeople}
        isDisabled
      />
    </Stack>
  );
}
