import { createSignal } from "@barqjs/core";
import {
  Inline,
  Input,
  Label,
  type SearchResultGroup,
  type SearchResultKind,
  SearchResults,
  SegmentedControl,
  Stack,
} from "@barqjs/arc";
import { GraduationCap } from "@barqjs/lucide/icons/graduation-cap";
import { Inbox } from "@barqjs/lucide/icons/inbox";
import { School } from "@barqjs/lucide/icons/school";

const KINDS: SearchResultKind[] = [
  { id: "students", label: "Students", icon: <GraduationCap /> },
  { id: "classes", label: "Classes", icon: <School /> },
  { id: "messages", label: "Messages", icon: <Inbox /> },
];

const STUDENTS = [
  "Salma Hassan",
  "Salma Adel",
  "Salman Khalid",
  "Salma Nour",
  "Salma Fathy",
  "Salma Youssef",
  "Salma Kamel",
].map((name, at) => ({
  id: `s${String(at)}`,
  title: name,
  description: `Year ${String(3 + (at % 4))}, class ${String.fromCharCode(65 + (at % 3))}`,
  href: `#student-${String(at)}`,
}));

const GROUPS: SearchResultGroup[] = [
  { kind: "students", results: STUDENTS, total: 23, hasMore: true },
  {
    kind: "classes",
    results: [
      {
        id: "c1",
        title: "Arabic 4B",
        description: "Taught by Salma Nour",
        snippet: "Salma Nour takes this class on Sundays and Tuesdays.",
        href: "#class-4b",
      },
    ],
  },
  {
    kind: "messages",
    results: [
      {
        id: "m1",
        title: "Trip permission slips",
        snippet: "…Salma's mother asked whether the slips can be signed online…",
        meta: "Mar 2",
        href: "#message-1",
      },
      {
        id: "m2",
        title: "Re: reading club",
        snippet: "Thanks Salma, the club moves to Thursday.",
        meta: "Feb 27",
        href: "#message-2",
      },
    ],
  },
];

type State = "done" | "loading" | "error";

export default function SearchResultsExample() {
  const [query, setQuery] = createSignal("salma");
  const [state, setState] = createSignal<State>("done");
  const [more, setMore] = createSignal(false);
  return (
    <Stack gap={4}>
      <Inline gap={3} wrap align="end">
        <Stack gap={1.5}>
          <Label for="records-search">Search the school</Label>
          <Input
            id="records-search"
            type="search"
            value={query()}
            onInput={(event: Event) => setQuery((event.currentTarget as HTMLInputElement).value)}
          />
        </Stack>
        <SegmentedControl
          aria-label="State"
          size="sm"
          items={[
            { value: "done", label: "Found" },
            { value: "loading", label: "Searching" },
            { value: "error", label: "Failed" },
          ]}
          value={state()}
          onChange={(value: string) => setState(value as State)}
        />
      </Inline>
      <SearchResults
        query={query()}
        kinds={KINDS}
        groups={query().trim() === "" || query().toLowerCase().includes("salm") ? GROUPS : []}
        status={state()}
        onRetry={() => setState("done")}
        isLoadingMore={more()}
        onLoadMore={() => {
          setMore(true);
          setTimeout(() => setMore(false), 800);
        }}
        idle="Type a name, a class or words from a message."
      />
    </Stack>
  );
}
