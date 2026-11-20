import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function ZodiacSagittarius(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M15 3h6v6" />
      <path d="M21 3 3 21" />
      <path d="m9 9 6 6" />
    </svg>
  );
}
