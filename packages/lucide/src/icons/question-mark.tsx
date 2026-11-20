import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function QuestionMark(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M12 15c0-2.48 5-2.99 5-6.5a5 4.5 0 00-10 0" />
      <path d="M12 20h.01" />
    </svg>
  );
}
