import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function LoaderCircle(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}
