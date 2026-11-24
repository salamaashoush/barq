interface Node {
  type: string;
  parent?: Node;
}

interface Context {
  report(descriptor: { node: Node; messageId: string }): void;
}

/** A type alias, or a union or intersection that is the whole of one. */
function namesIt(node: Node): boolean {
  let parent = node.parent;
  while (
    parent !== undefined &&
    (parent.type === "TSUnionType" || parent.type === "TSIntersectionType")
  ) {
    parent = parent.parent;
  }
  return parent?.type === "TSTypeAliasDeclaration";
}

const noInlineTypes = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Disallow object type literals outside a named `interface` or `type`, so every shape has a name a reader can find.",
    },
    messages: {
      inline: "Name this shape: declare an `interface` (or a `type`) and refer to it.",
    },
    schema: [],
  },
  create(context: Context) {
    return {
      TSTypeLiteral(node: Node) {
        if (!namesIt(node)) context.report({ node, messageId: "inline" });
      },
    };
  },
};

export default {
  meta: { name: "barq" },
  rules: { "no-inline-types": noInlineTypes },
};
