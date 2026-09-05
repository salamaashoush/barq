import { Dynamic, For } from "@barqjs/core";
import { css } from "@barqjs/css";
import { Link, useParams } from "@barqjs/router";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Empty,
} from "@barqjs/ui";

import { BLOCKS, blockNamed, type BlockEntry } from "./blocks/registry.ts";
import { Page } from "./site.tsx";

const grid = css`
  display: grid;
  gap: 1rem;
  grid-template-columns: repeat(auto-fill, minmax(18rem, 1fr));
`;

const plain = css`
  text-decoration: none;
  color: inherit;
`;

const tags = css`
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
`;

export function BlocksIndex() {
  return (
    <Page title="Blocks" lede="Whole pages, built from this package's components.">
      <div class={grid}>
        <For each={() => BLOCKS}>
          {(block: BlockEntry) => (
            <Link to={`/blocks/${block.name}`} class={plain}>
              <Card>
                <CardHeader>
                  <CardTitle>{block.title}</CardTitle>
                  <CardDescription>{block.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div class={tags}>
                    <For each={() => block.categories}>
                      {(category: string) => <Badge variant="secondary">{category}</Badge>}
                    </For>
                  </div>
                </CardContent>
              </Card>
            </Link>
          )}
        </For>
      </div>
    </Page>
  );
}

const full = css`
  min-height: calc(100dvh - 3.5rem);
`;

/**
 * One block, at its own address, filling the page.
 *
 * No heading and no padding around it: a block IS a page, and a frame around
 * one is a picture of a page rather than the thing itself.
 */
export function BlockPage() {
  const params = useParams();
  const block = (): BlockEntry | undefined => blockNamed(params().name ?? "");

  return (
    <div class={full} data-slot="block-page">
      {/* `Dynamic`, not `found.component()`. A component is a Block and calling
          one outside a scope throws "a Block was invoked without a scope" — the
          function is a description of a subtree, not the subtree. */}
      {() =>
        block() === undefined ? (
          <Page title="No such block">
            <Empty>
              <Link to="/blocks" class={plain}>
                <Button variant="outline">Back to the blocks</Button>
              </Link>
            </Empty>
          </Page>
        ) : (
          <Dynamic component={block()?.component} />
        )
      }
    </div>
  );
}
