import { css } from "@barqjs/css";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@barqjs/ui";

const frame = css`
  width: 400px;
  max-width: 100%;
`;

const body = css`
  color: var(--muted-foreground);
`;

interface Section {
  readonly id: string;
  readonly name: string;
  readonly body: string;
}

const sections: readonly Section[] = [
  { id: "account", name: "Account", body: "Change your name and the email you sign in with." },
  { id: "password", name: "Password", body: "Choose a new password. You stay signed in." },
  { id: "team", name: "Team", body: "Invite people and decide what each of them can change." },
];

export default function TabsItems() {
  return (
    <Tabs items={sections} class={frame}>
      <TabsList aria-label="Settings">
        {(section: Section) => <TabsTrigger>{section.name}</TabsTrigger>}
      </TabsList>
      <TabsContent>{(section: Section) => <p class={body}>{section.body}</p>}</TabsContent>
    </Tabs>
  );
}
