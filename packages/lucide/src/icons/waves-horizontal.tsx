import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function WavesHorizontal(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M2 12q2.5 2 5 0t5 0 5 0 5 0" />
      <path d="M2 19q2.5 2 5 0t5 0 5 0 5 0" />
      <path d="M2 5q2.5 2 5 0t5 0 5 0 5 0" />
    </svg>
  );
}
