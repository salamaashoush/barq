import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function FaceExpressionless(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M14 10h2" />
      <path d="M8 10h2" />
      <path d="M8 16h8" />
      <circle cx="12" cy="12" r="10" />
    </svg>
  );
}
