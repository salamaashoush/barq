import { Show } from "@barqjs/core";
import { useLexicalEditor } from "@barqjs/lexical";
import { Image as ImageIcon } from "@barqjs/lucide/icons/image";
import type { ElementFormatType } from "lexical";

import { storedBlockData } from "./blocks.tsx";
import { OPEN_IMAGE_DIALOG_COMMAND } from "./commands.ts";
import { type EditorExtension, defineEditorExtension } from "./extension.ts";
import { useDialogCommand } from "./hooks.ts";
import { ImageDialog, ImagePaste } from "./media-insert.tsx";
import { editorUploads } from "./media.tsx";
import {
  $isImageNode,
  type ImageData,
  ImageBlock,
  PictureFigure,
  type PictureOptions,
  pictureLooks,
  sizeAndAlignment,
} from "./picture.tsx";

function ImageDialogHost() {
  const editor = useLexicalEditor();
  const [open, setOpen] = useDialogCommand(OPEN_IMAGE_DIALOG_COMMAND);
  return (
    <Show when={editorUploads(editor) !== null}>
      <ImageDialog open={open()} onOpenChange={setOpen} maxSize={editorUploads(editor)?.maxSize} />
      <ImagePaste />
    </Show>
  );
}

/**
 * Pictures: offered, pasted and dropped where the editor uploads, each shown
 * at once and sent through arc's upload queue; drawn at one of four sizes,
 * placed at the start, middle or end, with alt text or marked decorative
 * (and a warning while neither), a caption, a credit with its licence, a
 * focus point and numbered labels. A picture's look takes `class`, `classes`
 * and a `renders.caption`, in the editor and the renderer alike.
 */
export function imageExtension(options: PictureOptions = {}): EditorExtension {
  return defineEditorExtension({
    name: "arc/image",
    dependencies: [ImageBlock],
    register: (editor) => pictureLooks.provide(editor, options),
    commands: [
      {
        id: "image",
        label: (messages) => messages.image,
        group: (messages) => messages.mediaBlocks,
        icon: () => <ImageIcon />,
        keywords: ["picture", "photo", "upload"],
        available: (editor) => editorUploads(editor) !== null,
        run: (editor) => editor.dispatchCommand(OPEN_IMAGE_DIALOG_COMMAND, undefined),
      },
    ],
    blockMenu: sizeAndAlignment($isImageNode),
    render: {
      image: (node, scope) => (
        <PictureFigure
          data={storedBlockData<ImageData>(ImageBlock, node)}
          format={(typeof node.format === "string" ? node.format : "") as ElementFormatType}
          options={options}
          editable={scope.editing}
        />
      ),
    },
    plugins: [ImageDialogHost],
  });
}
