import { describe, expect, it } from "vitest";

import { STEP_EXAMPLES, lookStepOk } from "../lookSteps";

// The cases of tower-core's `look_steps_are_read_from_lines`, and the edges of each verb.
describe("look steps", () => {
  it("reads the lines the supervisor reads", () => {
    for (const ok of ["click #buy", "type input[name=qty] 3 boxes", "wait for .total", "wait 250", "press Enter", "  click   .row:first-child  "]) expect(lookStepOk(ok), ok).toBe(true);
  });

  it("marks the lines the supervisor refuses", () => {
    for (const bad of ["wait 99999", "drag a b", "", "click", "type #qty", "wait for", "wait soon", "press"]) expect(lookStepOk(bad), bad).toBe(false);
  });

  it("offers only examples that are steps", () => {
    for (const e of STEP_EXAMPLES) expect(lookStepOk(e), e).toBe(true);
  });
});
