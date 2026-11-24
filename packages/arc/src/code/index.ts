export { CodeBlock, type CodeBlockProps, Highlight, type HighlightProps } from "./code-block.tsx";
export { codeHighlighter, highlightHtml } from "./highlight.ts";
export {
  type CodeLanguage,
  type LanguageLoader,
  isKnownLanguage,
  languageNames,
  loadLanguage,
  loadedLanguage,
  registerLanguage,
} from "./languages.ts";
export { type ExtensionSource } from "./options.ts";
