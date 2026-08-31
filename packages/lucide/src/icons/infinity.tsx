import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

function InfinityIcon(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M6 16c5 0 7-8 12-8a4 4 0 0 1 0 8c-5 0-7-8-12-8a4 4 0 1 0 0 8" />
    </svg>
  );
}

export { InfinityIcon as Infinity };
