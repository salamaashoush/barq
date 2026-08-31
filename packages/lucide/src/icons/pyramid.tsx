import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Pyramid(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M2.5 16.88a1 1 0 0 1-.32-1.43l9-13.02a1 1 0 0 1 1.64 0l9 13.01a1 1 0 0 1-.32 1.44l-8.51 4.86a2 2 0 0 1-1.98 0Z" />
      <path d="M12 2v20" />
    </svg>
  );
}
