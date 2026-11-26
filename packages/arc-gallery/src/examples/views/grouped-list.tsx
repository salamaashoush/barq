import { createSignal } from "@barqjs/core";
import { List, ListItem, Stack, useDateSections } from "@barqjs/arc";
import { BookOpen } from "@barqjs/lucide/icons/book-open";

import { NOW } from "../../data/operations.ts";
import { DUE, type Due } from "../../data/views.ts";

export default function GroupedListExample() {
  const [count, setCount] = createSignal(4);
  const [loading, setLoading] = createSignal(false);
  const byDay = useDateSections({ timeZone: "Europe/Berlin", now: NOW });
  const byMonth = useDateSections({ by: "month", timeZone: "Europe/Berlin", now: NOW });

  function more(): void {
    setLoading(true);
    setTimeout(() => {
      setCount(DUE.length);
      setLoading(false);
    }, 500);
  }

  return (
    <Stack gap={6}>
      <List
        aria-label="Work due, by day"
        items={DUE.slice(0, count())}
        section={(work) => byDay(work.due)}
        onLoadMore={count() < DUE.length ? more : undefined}
        isLoadingMore={loading()}
        loadMore="button"
        loadMoreLabel="Show older"
      >
        {(work: Due) => (
          <ListItem title={work.title} description={work.course} media={<BookOpen />} />
        )}
      </List>
      <List aria-label="Work due, by month" items={DUE} section={(work) => byMonth(work.due)}>
        {(work: Due) => <ListItem title={work.title} description={work.course} />}
      </List>
    </Stack>
  );
}
