import { css } from "@barqjs/css";
import { ArrowUpRight } from "@barqjs/lucide/icons/arrow-up-right";
import { FolderCode } from "@barqjs/lucide/icons/folder-code";
import {
  Button,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@barqjs/ui";

const actions = css`
  flex-direction: row;
  justify-content: center;
  gap: calc(var(--spacing) * 2);
`;

const muted = css`
  color: var(--muted-foreground);
`;

export default function EmptyDemo() {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <FolderCode />
        </EmptyMedia>
        <EmptyTitle>No Projects Yet</EmptyTitle>
        <EmptyDescription>
          You haven't created any projects yet. Get started by creating your first project.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent class={actions}>
        <Button>Create Project</Button>
        <Button variant="outline">Import Project</Button>
      </EmptyContent>
      <Button variant="link" href="#" class={muted} size="sm">
        Learn More
        <ArrowUpRight />
      </Button>
    </Empty>
  );
}
