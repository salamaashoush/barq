import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function TriangleRight(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M22 18a2 2 0 0 1-2 2H3c-1.1 0-1.3-.6-.4-1.3L20.4 4.3c.9-.7 1.6-.4 1.6.7Z" />
    </svg>
  );
}
