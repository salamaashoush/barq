/**
 * Whether an editor's scene canvas covers the editor at device pixels.
 *
 * The end of a first render is the frame that draws the scene at full size.
 * A canvas measured before its container was laid out comes up 1 by 1, and
 * counting from its first frame times a draw of almost nothing.
 */
export function canvasAtFullSize(container: HTMLElement): boolean {
  const scale = window.devicePixelRatio;
  const width = Math.floor(container.clientWidth * scale);
  const height = Math.floor(container.clientHeight * scale);
  for (const canvas of container.querySelectorAll("canvas")) {
    if (canvas.width >= width - scale && canvas.height >= height - scale) return true;
  }
  return false;
}
