import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function LetterW(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="m21 4-4.794 15.821a.25.25 0 01-.471.021l-3.503-8.685a.25.25 0 00-.464 0l-3.503 8.685a.25.25 0 01-.47-.021L3 4" />
    </svg>
  );
}
