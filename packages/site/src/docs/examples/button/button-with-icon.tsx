import { GitBranch } from "@barqjs/lucide/icons/git-branch";
import { Button } from "@barqjs/ui";

export default function ButtonWithIcon() {
  return (
    <Button variant="outline" size="sm">
      <GitBranch data-icon="inline-start" />
      New Branch
    </Button>
  );
}
