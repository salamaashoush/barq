import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function AudioWaveform(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M2 13a2 2 0 0 0 2-2V7a2 2 0 0 1 4 0v13a2 2 0 0 0 4 0V4a2 2 0 0 1 4 0v13a2 2 0 0 0 4 0v-4a2 2 0 0 1 2-2" />
    </svg>
  );
}
