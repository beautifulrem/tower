import { describe, expect, it } from "vitest";

import { buildTree } from "../filetree";
import { applySuggestion, suggestionOf, withoutSuggestion } from "../suggest";

describe("suggestion blocks", () => {
  const comment = "Multiply, do not add:\n```suggestion\n  sum += price * qty;\n```";
  it("finds the replacement text", () => {
    expect(suggestionOf(comment)).toBe("  sum += price * qty;");
    expect(suggestionOf("no block here")).toBeNull();
    expect(withoutSuggestion(comment)).toBe("Multiply, do not add:");
  });
  it("replaces exactly the commented line and keeps the trailing newline", () => {
    const file = "a\nb\nc\n";
    expect(applySuggestion(file, 2, "B1\nB2")).toBe("a\nB1\nB2\nc\n");
    expect(applySuggestion(file, 2, "")).toBe("a\nc\n");
    expect(applySuggestion("a\nb", 2, "x")).toBe("a\nx");
  });
  it("leaves the file alone for a line it does not have", () => {
    expect(applySuggestion("a\nb\n", 9, "x")).toBe("a\nb\n");
  });
});

describe("file tree", () => {
  it("folds single-child directories and puts directories first", () => {
    const tree = buildTree(["src/cart/total.ts", "src/cart/money.ts", "README.md", "test/cart.test.js"]);
    expect(tree.map((n) => n.name)).toEqual(["src/cart/", "test/", "README.md"]);
    expect(tree[0].children.map((n) => n.name)).toEqual(["money.ts", "total.ts"]);
    expect(tree[0].children[0].path).toBe("src/cart/money.ts");
    expect(tree[1].children[0].file).toBe(true);
  });
});
