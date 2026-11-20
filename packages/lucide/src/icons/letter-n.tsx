import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function LetterN(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M6 20V4.25a.25.25 0 01.455-.143l11.09 15.786a.25.25 0 00.455-.144V4" />
    </svg>
  );
}
