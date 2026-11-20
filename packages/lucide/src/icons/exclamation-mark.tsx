import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function ExclamationMark(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M12 15V4" />
      <path d="M12 20h.01" />
    </svg>
  );
}
