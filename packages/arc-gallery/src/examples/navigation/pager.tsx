import { For, createSignal } from "@barqjs/core";
import {
  Code,
  Inline,
  Pager,
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  Stack,
  Text,
  pageWindow,
} from "@barqjs/arc";

const PAGES = 20;

export default function Pagers() {
  const [page, setPage] = createSignal(4);
  const [size, setSize] = createSignal(25);
  const [simple, setSimple] = createSignal(0);
  function go(event: MouseEvent, to: number): void {
    event.preventDefault();
    setPage(Math.min(PAGES - 1, Math.max(0, to)));
  }
  return (
    <Stack gap={6}>
      <Pager
        pageIndex={page()}
        onPageIndexChange={setPage}
        total={487}
        pageSize={size()}
        pageSizes={[10, 25, 50]}
        onPageSizeChange={setSize}
        showEdges
      />
      <Pager variant="compact" pageIndex={page()} onPageIndexChange={setPage} pageCount={PAGES} />
      <Pager variant="simple" pageIndex={simple()} onPageIndexChange={setSimple} pageCount={3} />
      <Pager pageCount={8} defaultPageIndex={2} isDisabled />

      <Stack gap={2}>
        <Text size="sm" weight="medium">
          pageWindow({page()}, {PAGES}), drawn with ui's Pagination
        </Text>
        <Inline gap={1} wrap>
          <For each={pageWindow(page(), PAGES)}>
            {(slot) => <Code>{slot === "gap" ? "…" : String(slot + 1)}</Code>}
          </For>
        </Inline>
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious href="#" onClick={(event: MouseEvent) => go(event, page() - 1)} />
            </PaginationItem>
            <For each={pageWindow(page(), PAGES)}>
              {(slot) => (
                <PaginationItem>
                  {slot === "gap" ? (
                    <PaginationEllipsis />
                  ) : (
                    <PaginationLink
                      href="#"
                      isActive={slot === page()}
                      onClick={(event: MouseEvent) => go(event, slot)}
                    >
                      {slot + 1}
                    </PaginationLink>
                  )}
                </PaginationItem>
              )}
            </For>
            <PaginationItem>
              <PaginationNext href="#" onClick={(event: MouseEvent) => go(event, page() + 1)} />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </Stack>
    </Stack>
  );
}
