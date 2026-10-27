import { fireEvent, render, screen } from "@solidjs/testing-library";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { invoked } from "../../test/setup";

vi.mock("../../lib/store", async () => {
  const { createStore } = await import("solid-js/store");
  const [state] = createStore({ settings: { language: "en" }, goals: {}, inbox: [], projects: [], now: Date.now() });
  return { state, toast: vi.fn(), act: async <T,>(fn: () => Promise<T>) => fn(), refreshEnvironment: async () => {} };
});

const { GitIdentityForm } = await import("../GitIdentity");

const fill = async () => {
  fireEvent.input(screen.getByLabelText("Your name"), { target: { value: "Ada Lovelace" } });
  fireEvent.input(screen.getByLabelText("you@example.com"), { target: { value: "ada@example.com" } });
  fireEvent.click(screen.getByText("Set in git").closest("button")!);
  await Promise.resolve();
  await Promise.resolve();
};

describe("the git identity form", () => {
  beforeEach(() => invoked.splice(0));

  it("writes to git's global config when there is no project to speak of", async () => {
    render(() => <GitIdentityForm />);
    expect(screen.queryByLabelText(/Only for/)).toBeNull();
    await fill();
    expect(invoked.map((i) => i.cmd)).toEqual(["set_git_identity"]);
    expect(invoked[0].args).toEqual({ name: "Ada Lovelace", email: "ada@example.com", projectId: null });
  });

  it("in a project's context writes to that repository by default, and to the global config only when asked", async () => {
    render(() => <GitIdentityForm projectId="p1" projectName="shop" />);
    const only = screen.getByLabelText("Only for shop") as HTMLInputElement;
    expect(only.checked).toBe(true);
    expect(screen.getByText(/shop's own repository config/)).toBeTruthy();
    await fill();
    expect(invoked[0].args).toEqual({ name: "Ada Lovelace", email: "ada@example.com", projectId: "p1" });
    invoked.splice(0);
    fireEvent.click(only);
    expect(only.checked).toBe(false);
    fireEvent.click(screen.getByText("Set in git").closest("button")!);
    await Promise.resolve();
    expect(invoked[0].args).toEqual({ name: "Ada Lovelace", email: "ada@example.com", projectId: null });
  });

  it("offers a scope among several projects, every repository first", () => {
    render(() => <GitIdentityForm projects={[{ id: "p1", name: "shop" }, { id: "p2", name: "docs" }] as never} />);
    expect(screen.getByRole("button", { name: "Where: Every repository (git's global config)" })).toBeTruthy();
    expect(screen.queryByLabelText(/Only for/)).toBeNull();
  });
});
