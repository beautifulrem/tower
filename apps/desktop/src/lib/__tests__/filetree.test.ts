import { describe, expect, it } from "vitest";

import { buildTree } from "../filetree";

describe("file tree", () => {
  it("folds single-child directories and lists directories before files", () => {
    const t = buildTree(["src/cart/money.js", "src/cart.js", "test/setup.js"]);
    expect(t.map((n) => n.name)).toEqual(["src/", "test/"]);
    expect(t[0].children.map((n) => n.name)).toEqual(["cart/", "cart.js"]);
    expect(t[0].children[0].children[0].path).toBe("src/cart/money.js");
  });

  it("starts below a directory the caller already names, keeping full paths", () => {
    const t = buildTree(["src/cart/money.js", "src/cart.js"], "src/");
    expect(t.map((n) => n.name)).toEqual(["cart/", "cart.js"]);
    expect(t[0].children[0].path).toBe("src/cart/money.js");
    expect(t[1].path).toBe("src/cart.js");
  });
});
