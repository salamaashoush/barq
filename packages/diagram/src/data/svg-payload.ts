import { EXPORT_DATA_TYPES, MIME_TYPES } from "@excalidraw/common";

import { base64ToString, decode, encode, stringToBase64 } from "./encode.ts";

import type { EncodedData } from "./encode.ts";

export const createHTMLComment = (ownerDocument: Document, text: string) => {
  // surrounding with spaces to maintain prettified consistency with previous
  // iterations
  // <!-- comment -->
  return ownerDocument.createComment(` ${text} `);
};

export const encodeSvgBase64Payload = ({
  payload,
  metadataElement,
}: {
  payload: string;
  metadataElement: SVGMetadataElement;
}) => {
  const base64 = stringToBase64(
    JSON.stringify(encode({ text: payload })),
    true /* is already byte string */,
  );

  const ownerDocument = metadataElement.ownerDocument;

  metadataElement.appendChild(
    createHTMLComment(ownerDocument, `payload-type:${MIME_TYPES.excalidraw}`),
  );
  metadataElement.appendChild(createHTMLComment(ownerDocument, "payload-version:2"));
  metadataElement.appendChild(createHTMLComment(ownerDocument, "payload-start"));
  metadataElement.appendChild(ownerDocument.createTextNode(base64));
  metadataElement.appendChild(createHTMLComment(ownerDocument, "payload-end"));
};

export const decodeSvgBase64Payload = ({ svg }: { svg: string }) => {
  if (svg.includes(`payload-type:${MIME_TYPES.excalidraw}`)) {
    const match = svg.match(/<!-- payload-start -->\s*(.+?)\s*<!-- payload-end -->/);
    if (!match) {
      throw new Error("INVALID");
    }
    const versionMatch = svg.match(/<!-- payload-version:(\d+) -->/);
    const version = versionMatch?.[1] || "1";
    const isByteString = version !== "1";

    try {
      const json = base64ToString(match[1]!, isByteString);
      const encodedData = JSON.parse(json) as EncodedData | { type?: unknown };
      if (!("encoded" in encodedData)) {
        // legacy, un-encoded scene JSON
        if ("type" in encodedData && encodedData.type === EXPORT_DATA_TYPES.excalidraw) {
          return json;
        }
        throw new Error("FAILED");
      }
      return decode(encodedData);
    } catch (error: unknown) {
      console.error(error);
      throw new Error("FAILED", { cause: error });
    }
  }
  throw new Error("INVALID");
};
