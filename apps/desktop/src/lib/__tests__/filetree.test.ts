import { describe, expect, it } from "vitest";

import { buildTree, treeOrder, unitUnder } from "../filetree";

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

  it("gives the diff the tree's order, so ] walks the list the sidebar shows", () => {
    // By path alone cart.js would come first ("." sorts before "/"); the tree puts the directory first.
    expect(treeOrder(["src/cart.js", "src/cart/money.js", "test/setup.js"])).toEqual(["src/cart/money.js", "src/cart.js", "test/setup.js"]);
    expect(treeOrder(["src/cart.js", "src/cart/money.js"], unitUnder({ title: "src/", files: ["src/cart.js", "src/cart/money.js"] }))).toEqual(["src/cart/money.js", "src/cart.js"]);
    expect(unitUnder({ title: "Checkout", files: ["src/cart.js"] })).toBe("");
  });
});
