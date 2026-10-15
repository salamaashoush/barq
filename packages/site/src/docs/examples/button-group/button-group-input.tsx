import { Search } from "@barqjs/lucide/icons/search";
import { Button, ButtonGroup, Input } from "@barqjs/ui";

export default function ButtonGroupInput() {
  return (
    <ButtonGroup>
      <Input placeholder="Search..." aria-label="Search query" />
      <Button variant="outline" aria-label="Search">
        <Search />
      </Button>
    </ButtonGroup>
  );
}
