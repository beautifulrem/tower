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

export function buildTree(paths: string[]): TreeNode[] {
  const root: TreeNode = { name: "", path: "", children: [], file: false };
  for (const p of [...paths].sort()) {
    const parts = p.split("/");
    let node = root;
    for (let i = 0; i < parts.length; i++) {
      const last = i === parts.length - 1;
      const name = last ? parts[i] : `${parts[i]}/`;
      const path = parts.slice(0, i + 1).join("/");
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
