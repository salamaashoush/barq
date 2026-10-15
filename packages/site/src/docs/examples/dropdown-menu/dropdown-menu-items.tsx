import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@barqjs/ui";

interface Action {
  readonly id: string;
  readonly name: string;
}

const actions: readonly Action[] = [
  { id: "rename", name: "Rename" },
  { id: "duplicate", name: "Duplicate" },
  { id: "delete", name: "Delete" },
];

export default function DropdownMenuItems() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger>
        <Button variant="outline">Open</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent items={actions} aria-label="Actions">
        {(action: Action) => (
          <DropdownMenuItem variant={action.id === "delete" ? "destructive" : "default"}>
            {action.name}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
