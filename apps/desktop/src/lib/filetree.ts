/**
 * The review's file tree: paths folded into directories, each directory
 * collapsed to one node while it has a single child, so `src/cart/total.ts`
 * reads as `src/cart/` › `total.ts` rather than three levels of one entry.
 */
export interface TreeNode {
  /** The last path segment(s) shown on this row; directories end in "/". */
  name: string;
  /** The full path of a file; the directory prefix otherwise. */
  path: string;
  children: TreeNode[];
  /** Files only. */
  file: boolean;
}

/**
 * `under` is a directory prefix the caller already names (a review unit titled
 * `src/`): the tree starts below it, while every node keeps its full path.
 */
export function buildTree(paths: string[], under = ""): TreeNode[] {
  const root: TreeNode = { name: "", path: "", children: [], file: false };
  for (const p of [...paths].sort()) {
    const rel = under && p.startsWith(under) ? p.slice(under.length) : p;
    const base = rel === p ? "" : under;
    const parts = rel.split("/");
    let node = root;
    for (let i = 0; i < parts.length; i++) {
      const last = i === parts.length - 1;
      const name = last ? parts[i] : `${parts[i]}/`;
      const path = base + parts.slice(0, i + 1).join("/");
      let child = node.children.find((c) => c.name === name && c.file === last);
      if (!child) {
        child = { name, path, children: [], file: last };
        node.children.push(child);
      }
      node = child;
    }
  }
  const fold = (n: TreeNode): TreeNode => {
    let cur = n;
    while (!cur.file && cur.children.length === 1 && !cur.children[0].file) {
      const only = cur.children[0];
      cur = { name: cur.name + only.name, path: only.path, children: only.children, file: false };
    }
    return { ...cur, children: cur.children.map(fold).sort((a, b) => Number(a.file) - Number(b.file) || a.name.localeCompare(b.name)) };
  };
  return root.children.map(fold).sort((a, b) => Number(a.file) - Number(b.file) || a.name.localeCompare(b.name));
}

/** The directory a review unit's title already names (`src/`), when every one of its files is under it: the tree starts below it. */
export const unitUnder = (u: { title: string; files: string[] }): string => (u.title.endsWith("/") && u.files.every((f) => f.startsWith(u.title)) ? u.title : "");

/**
 * The files in the order the tree shows them (directories first, then files, by name at each level): the order the
 * diff lists them and `]` walks them, so the keyboard never moves through a different list from the one on the left.
 */
export function treeOrder(paths: string[], under = ""): string[] {
  const out: string[] = [];
  const walk = (nodes: TreeNode[]) => {
    for (const n of nodes) n.file ? out.push(n.path) : walk(n.children);
  };
  walk(buildTree(paths, under));
  return out;
}
