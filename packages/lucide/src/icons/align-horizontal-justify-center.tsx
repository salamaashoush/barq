import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function AlignHorizontalJustifyCenter(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <rect width="6" height="14" x="2" y="5" rx="2" />
      <rect width="6" height="10" x="16" y="7" rx="2" />
      <path d="M12 2v20" />
    </svg>
  );
}
