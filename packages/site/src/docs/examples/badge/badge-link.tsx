import { ArrowUpRight } from "@barqjs/lucide/icons/arrow-up-right";
import { Badge } from "@barqjs/ui";

export default function BadgeAsLink() {
  return (
    <Badge href="#link">
      Open Link <ArrowUpRight data-icon="inline-end" />
    </Badge>
  );
}
