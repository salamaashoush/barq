import { For, Match, Switch, createSignal, onCleanup } from "@barqjs/core";
import {
  Button,
  Input,
  Label,
  type RemoteState,
  Spinner,
  Stack,
  Text,
  remoteSearch,
} from "@barqjs/arc";
import { gap, layout, space, surface } from "@barqjs/arc/style";
import { layer } from "@barqjs/css";

import type { EntityHit } from "../../server/entities.ts";
import { searchEntities } from "../../server/entities.ts";

const demo = layer("demo");
const results = demo(surface.card, layout.column, gap[1], {
  padding: space.x3,
  minHeight: space.x16,
});
const row = demo(layout.row, layout.between, gap[3]);

export default function RemoteSearchExample() {
  const [state, setState] = createSignal<RemoteState<EntityHit>>({
    status: "idle",
    results: [],
    loadingMore: false,
  });
  const search = remoteSearch<EntityHit>({
    search:
      () =>
      (query, { signal, cursor }) =>
        searchEntities({
          data: { query, cursor: typeof cursor === "number" ? cursor : 0 },
          signal,
        }),
    minLength: 1,
    onChange: setState,
  });
  onCleanup(search.stop);

  return (
    <Stack gap={3}>
      <Stack gap={1.5}>
        <Label for="directory-search">Search Acme's directory</Label>
        <Input
          id="directory-search"
          type="search"
          placeholder="Try “an” or “design”"
          onInput={(event: Event) => search.query((event.currentTarget as HTMLInputElement).value)}
        />
      </Stack>
      <div class={results} aria-live="polite" aria-busy={state().status === "loading"}>
        <Switch>
          <Match when={state().status === "idle"}>
            <Text size="sm" color="muted">
              Type a letter to search.
            </Text>
          </Match>
          <Match when={state().status === "loading"}>
            <Spinner />
          </Match>
          <Match when={state().status === "error"}>
            <Text size="sm" color="danger">
              The directory did not answer.
            </Text>
          </Match>
          <Match when={state().results.length === 0}>
            <Text size="sm" color="muted">
              Nobody matches.
            </Text>
          </Match>
          <Match when={true}>
            <For each={state().results}>
              {(hit) => (
                <div class={row}>
                  <Text size="sm" weight="medium">
                    {hit.label}
                  </Text>
                  <Text size="xs" color="muted">
                    {hit.description}
                  </Text>
                </div>
              )}
            </For>
            <Button
              variant="ghost"
              size="sm"
              isDisabled={state().next === undefined}
              isPending={state().loadingMore}
              onPress={search.more}
            >
              {state().next === undefined ? `All ${state().results.length} shown` : "Show more"}
            </Button>
          </Match>
        </Switch>
      </div>
    </Stack>
  );
}
