import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function TvMinimal(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M7 21h10" />
      <rect width="20" height="14" x="2" y="3" rx="2" />
    </svg>
  );
}
