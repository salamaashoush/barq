import { createSignal } from "@barqjs/core";
import { Grid, Stack, Text, type TreeNode, TreeView } from "@barqjs/arc";
import { dragAndDrop } from "@barqjs/aria/drag-and-drop";
import { File } from "@barqjs/lucide/icons/file";
import { Folder } from "@barqjs/lucide/icons/folder";

const folder = (id: string, label: string, children?: TreeNode[]): TreeNode => ({
  id,
  label,
  icon: <Folder />,
  ...(children === undefined ? { hasChildren: true } : { children }),
});

const file = (id: string, label: string, description?: string): TreeNode => ({
  id,
  label,
  icon: <File />,
  description,
});

const START: TreeNode[] = [
  folder("src", "src", [
    folder("routes", "routes", [
      file("index", "index.tsx", "2 KB"),
      file("billing", "billing.tsx", "6 KB"),
    ]),
    file("app", "app.tsx", "1 KB"),
    file("router", "router.ts", "3 KB"),
  ]),
  folder("archive", "archive"),
  file("readme", "README.md", "4 KB"),
  file("package", "package.json", "1 KB"),
];

/** Takes the nodes with these ids out of the tree, and hands them back. */
function take(nodes: readonly TreeNode[], ids: ReadonlySet<string>, out: TreeNode[]): TreeNode[] {
  return nodes.flatMap((node) => {
    if (ids.has(node.id)) {
      out.push(node);
      return [];
    }
    return node.children === undefined
      ? [node]
      : [{ ...node, children: take(node.children, ids, out) }];
  });
}

/** Puts `moved` before, after or into the node `target`. */
function put(
  nodes: readonly TreeNode[],
  target: string,
  position: string,
  moved: TreeNode[],
): TreeNode[] {
  return nodes.flatMap((node) => {
    if (node.id === target) {
      if (position === "before") return [...moved, node];
      if (position === "after") return [node, ...moved];
      return [{ ...node, children: [...(node.children ?? []), ...moved], hasChildren: undefined }];
    }
    return node.children === undefined
      ? [node]
      : [{ ...node, children: put(node.children, target, position, moved) }];
  });
}

const contains = (nodes: readonly TreeNode[], id: string): boolean =>
  nodes.some((node) => node.id === id || contains(node.children ?? [], id));

/** Fills in a folder whose children have just loaded. */
function fill(nodes: readonly TreeNode[], id: string, children: TreeNode[]): TreeNode[] {
  return nodes.map((node) => {
    if (node.id === id) return { ...node, children };
    return node.children === undefined
      ? node
      : { ...node, children: fill(node.children, id, children) };
  });
}

export default function TreeViewExample() {
  const [files, setFiles] = createSignal<TreeNode[]>(START);
  const [loading, setLoading] = createSignal<string[]>([]);
  const [selected, setSelected] = createSignal<"all" | Set<string | number>>(new Set(["app"]));

  const { dragAndDropHooks } = dragAndDrop<TreeNode>({
    getItems: (keys) => [...keys].map((key) => ({ "text/plain": String(key) })),
    onMove: (event) => {
      const ids = new Set([...event.keys].map(String));
      const moved: TreeNode[] = [];
      const rest = take(files(), ids, moved);
      const target = String(event.target.key);
      // A folder dropped into itself has nowhere to go.
      if (!contains(rest, target)) return;
      setFiles(put(rest, target, event.target.dropPosition, moved));
    },
  });

  const selectedFile = () => {
    const keys = selected();
    return keys === "all" ? "everything" : [...keys].join(", ") || "nothing";
  };

  const load = (id: string) => {
    setLoading((ids) => [...ids, id]);
    setTimeout(() => {
      setFiles((nodes) =>
        fill(nodes, id, [
          file(`${id}-2025`, "2025-report.pdf", "1.2 MB"),
          file(`${id}-2024`, "2024-report.pdf", "980 KB"),
        ]),
      );
      setLoading((ids) => ids.filter((each) => each !== id));
    }, 900);
  };

  return (
    <Grid columns={{ base: 1, cqMd: 2 }} gap={6}>
      <Stack gap={2}>
        <Text size="sm" weight="medium">
          Files: drag to reorder or into a folder, open archive to load it
        </Text>
        <TreeView
          aria-label="Repository files"
          items={files()}
          defaultExpandedKeys={["src", "routes"]}
          selectionMode="single"
          selectedKeys={selected()}
          onSelectionChange={setSelected}
          onLoadChildren={load}
          loadingKeys={loading()}
          dragAndDropHooks={dragAndDropHooks}
        />
        <Text size="sm" color="muted">
          Selected: {selectedFile()}
        </Text>
      </Stack>
      <Stack gap={2}>
        <Text size="sm" weight="medium">
          Several chosen, one disabled
        </Text>
        <TreeView
          aria-label="Regions to deploy to"
          selectionMode="multiple"
          defaultSelectedKeys={["eu-west-1", "eu-central-1"]}
          defaultExpandedKeys={["europe", "americas"]}
          disabledKeys={["sa-east-1"]}
          items={[
            {
              id: "europe",
              label: "Europe",
              children: [
                { id: "eu-west-1", label: "Ireland", description: "eu-west-1" },
                { id: "eu-central-1", label: "Frankfurt", description: "eu-central-1" },
              ],
            },
            {
              id: "americas",
              label: "Americas",
              children: [
                { id: "us-east-1", label: "Virginia", description: "us-east-1" },
                { id: "sa-east-1", label: "São Paulo", description: "sa-east-1, at capacity" },
              ],
            },
          ]}
        />
      </Stack>
    </Grid>
  );
}
