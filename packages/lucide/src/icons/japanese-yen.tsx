import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function JapaneseYen(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M12 12v8" />
      <path d="m6 4 6 8 6-8" />
      <path d="M8 13h8" />
      <path d="M8 17h8" />
    </svg>
  );
}
