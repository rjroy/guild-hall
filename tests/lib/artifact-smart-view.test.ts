import { describe, test, expect } from "bun:test";
import type { Artifact } from "@/lib/types";
import { statusToPriority } from "@/lib/types";
import {
  filterSmartView,
  smartViewCounts,
  artifactTypeSegment,
  artifactTypeLabel,
  artifactDomain,
} from "@/lib/artifact-smart-view";

function makeArtifact(
  relativePath: string,
  status: string,
  date = "2026-01-01",
): Artifact {
  return {
    relativePath,
    filePath: `/test/.lore/${relativePath}`,
    content: "",
    artifactType: "document",
    meta: {
      title: relativePath.split("/").pop()?.replace(".md", "") ?? "",
      date,
      status,
      tags: [],
      modules: [],
      extras: {},
    },
    lastModified: new Date(date),
  };
}

describe("approved in Group 0", () => {
  test("statusToPriority returns 0 for approved", () => {
    expect(statusToPriority("approved")).toBe(0);
  });
});

describe("What's Next filter", () => {
  test("includes Group 0 statuses", () => {
    const artifacts = [
      makeArtifact("specs/foo.md", "draft"),
      makeArtifact("specs/bar.md", "approved"),
    ];
    const result = filterSmartView(artifacts, "whats-next");
    expect(result).toHaveLength(2);
  });

  test("includes Group 2 statuses (blocked, failed)", () => {
    const artifacts = [
      makeArtifact("specs/baz.md", "blocked"),
      makeArtifact("specs/qux.md", "failed"),
    ];
    const result = filterSmartView(artifacts, "whats-next");
    expect(result).toHaveLength(2);
  });

  test("excludes Group 3 (terminal) statuses", () => {
    const artifacts = [makeArtifact("specs/done.md", "implemented")];
    const result = filterSmartView(artifacts, "whats-next");
    expect(result).toHaveLength(0);
  });
});

describe("Needs Discussion filter", () => {
  test("includes brainstorm/open", () => {
    const result = filterSmartView(
      [makeArtifact("brainstorm/idea.md", "open")],
      "needs-discussion",
    );
    expect(result).toHaveLength(1);
  });

  test("excludes brainstorm/parked", () => {
    const result = filterSmartView(
      [makeArtifact("brainstorm/parked.md", "parked")],
      "needs-discussion",
    );
    expect(result).toHaveLength(0);
  });

  test("includes issues/open", () => {
    const result = filterSmartView(
      [makeArtifact("issues/bug.md", "open")],
      "needs-discussion",
    );
    expect(result).toHaveLength(1);
  });

  test("excludes issues/resolved", () => {
    const result = filterSmartView(
      [makeArtifact("issues/fixed.md", "resolved")],
      "needs-discussion",
    );
    expect(result).toHaveLength(0);
  });

  test("includes research/active", () => {
    const result = filterSmartView(
      [makeArtifact("research/lib.md", "active")],
      "needs-discussion",
    );
    expect(result).toHaveLength(1);
  });

  test("excludes research/archived", () => {
    const result = filterSmartView(
      [makeArtifact("research/old.md", "archived")],
      "needs-discussion",
    );
    expect(result).toHaveLength(0);
  });

  test("excludes specs/open (wrong directory type)", () => {
    const result = filterSmartView(
      [makeArtifact("specs/spec.md", "open")],
      "needs-discussion",
    );
    expect(result).toHaveLength(0);
  });
});

describe("Ready to Advance filter", () => {
  test("includes specs/approved", () => {
    const result = filterSmartView(
      [makeArtifact("specs/feature.md", "approved")],
      "ready-to-advance",
    );
    expect(result).toHaveLength(1);
  });

  test("includes plans/approved", () => {
    const result = filterSmartView(
      [makeArtifact("plans/impl.md", "approved")],
      "ready-to-advance",
    );
    expect(result).toHaveLength(1);
  });

  test("includes design/approved", () => {
    const result = filterSmartView(
      [makeArtifact("design/arch.md", "approved")],
      "ready-to-advance",
    );
    expect(result).toHaveLength(1);
  });

  test("excludes retros/approved (retros aren't advanceable)", () => {
    const result = filterSmartView(
      [makeArtifact("retros/lesson.md", "approved")],
      "ready-to-advance",
    );
    expect(result).toHaveLength(0);
  });

  test("excludes specs/draft (not approved)", () => {
    const result = filterSmartView(
      [makeArtifact("specs/wip.md", "draft")],
      "ready-to-advance",
    );
    expect(result).toHaveLength(0);
  });
});

describe("cross-view membership (REQ-SMARTVIEW-10)", () => {
  test("approved spec appears in both What's Next and Ready to Advance", () => {
    const artifacts = [makeArtifact("specs/feature.md", "approved")];
    expect(filterSmartView(artifacts, "whats-next")).toHaveLength(1);
    expect(filterSmartView(artifacts, "ready-to-advance")).toHaveLength(1);
  });

  test("blocked spec appears only in What's Next", () => {
    const artifacts = [makeArtifact("specs/stuck.md", "blocked")];
    expect(filterSmartView(artifacts, "whats-next")).toHaveLength(1);
    expect(filterSmartView(artifacts, "needs-discussion")).toHaveLength(0);
    expect(filterSmartView(artifacts, "ready-to-advance")).toHaveLength(0);
  });
});

describe("exclusions", () => {
  test("meetings are excluded from all views", () => {
    const artifacts = [makeArtifact("meetings/session.md", "open")];
    expect(filterSmartView(artifacts, "whats-next")).toHaveLength(0);
    expect(filterSmartView(artifacts, "needs-discussion")).toHaveLength(0);
    expect(filterSmartView(artifacts, "ready-to-advance")).toHaveLength(0);
  });

  test("commissions are excluded from all views", () => {
    const artifacts = [makeArtifact("commissions/task.md", "draft")];
    expect(filterSmartView(artifacts, "whats-next")).toHaveLength(0);
    expect(filterSmartView(artifacts, "needs-discussion")).toHaveLength(0);
    expect(filterSmartView(artifacts, "ready-to-advance")).toHaveLength(0);
  });

  test("root-level files are candidates for smart views", () => {
    const artifacts = [makeArtifact("vision.md", "draft")];
    // Root-level draft appears in whats-next (Group 0)
    expect(filterSmartView(artifacts, "whats-next")).toHaveLength(1);
    // Not a generative investigation type, so excluded from needs-discussion
    expect(filterSmartView(artifacts, "needs-discussion")).toHaveLength(0);
    // Not a work item type, so excluded from ready-to-advance
    expect(filterSmartView(artifacts, "ready-to-advance")).toHaveLength(0);
  });
});

describe("informational types not surfaced", () => {
  test("retros/complete does not appear in any smart view", () => {
    const artifacts = [makeArtifact("retros/lesson.md", "complete")];
    expect(filterSmartView(artifacts, "whats-next")).toHaveLength(0);
    expect(filterSmartView(artifacts, "needs-discussion")).toHaveLength(0);
    expect(filterSmartView(artifacts, "ready-to-advance")).toHaveLength(0);
  });

  test("reference/current does not appear in any smart view", () => {
    const artifacts = [makeArtifact("reference/guide.md", "current")];
    expect(filterSmartView(artifacts, "whats-next")).toHaveLength(0);
    expect(filterSmartView(artifacts, "needs-discussion")).toHaveLength(0);
    expect(filterSmartView(artifacts, "ready-to-advance")).toHaveLength(0);
  });

  test("diagrams/current does not appear in any smart view", () => {
    const artifacts = [makeArtifact("diagrams/flow.md", "current")];
    expect(filterSmartView(artifacts, "whats-next")).toHaveLength(0);
    expect(filterSmartView(artifacts, "needs-discussion")).toHaveLength(0);
    expect(filterSmartView(artifacts, "ready-to-advance")).toHaveLength(0);
  });
});

describe("badge counts match filtered item counts", () => {
  test("smartViewCounts matches filterSmartView lengths", () => {
    const artifacts = [
      makeArtifact("specs/a.md", "draft"),
      makeArtifact("specs/b.md", "approved"),
      makeArtifact("specs/c.md", "blocked"),
      makeArtifact("specs/d.md", "implemented"),
      makeArtifact("brainstorm/e.md", "open"),
      makeArtifact("issues/f.md", "open"),
      makeArtifact("research/g.md", "active"),
      makeArtifact("plans/h.md", "approved"),
      makeArtifact("design/i.md", "approved"),
      makeArtifact("retros/j.md", "complete"),
      makeArtifact("meetings/k.md", "open"),
      makeArtifact("commissions/l.md", "draft"),
      makeArtifact("README.md", "draft"),
    ];

    const counts = smartViewCounts(artifacts);
    expect(counts["whats-next"]).toBe(
      filterSmartView(artifacts, "whats-next").length,
    );
    expect(counts["needs-discussion"]).toBe(
      filterSmartView(artifacts, "needs-discussion").length,
    );
    expect(counts["ready-to-advance"]).toBe(
      filterSmartView(artifacts, "ready-to-advance").length,
    );
  });
});

describe("path metadata extraction", () => {
  test("artifactTypeSegment", () => {
    expect(artifactTypeSegment("specs/infrastructure/daemon.md")).toBe("specs");
    expect(artifactTypeSegment("plans/ui/sorting.md")).toBe("plans");
    expect(artifactTypeSegment("brainstorm/idea.md")).toBe("brainstorm");
    expect(artifactTypeSegment("README.md")).toBeNull();
  });

  test("artifactTypeLabel", () => {
    expect(artifactTypeLabel("specs/infrastructure/daemon.md")).toBe("Spec");
    expect(artifactTypeLabel("plans/ui/sorting.md")).toBe("Plan");
    expect(artifactTypeLabel("brainstorm/idea.md")).toBe("Brainstorm");
    expect(artifactTypeLabel("README.md")).toBeNull();
  });

  test("artifactDomain", () => {
    expect(artifactDomain("specs/infrastructure/daemon.md")).toBe(
      "Infrastructure",
    );
    expect(artifactDomain("plans/ui/sorting.md")).toBe("Ui");
    expect(artifactDomain("brainstorm/idea.md")).toBeNull();
    expect(artifactDomain("README.md")).toBeNull();
  });
});

describe("sorting within views", () => {
  test("items are sorted by status priority then title", () => {
    const artifacts = [
      makeArtifact("specs/zebra.md", "approved"),
      makeArtifact("specs/alpha.md", "draft"),
      makeArtifact("specs/beta.md", "blocked"),
      makeArtifact("specs/gamma.md", "draft"),
    ];
    const result = filterSmartView(artifacts, "whats-next");
    const titles = result.map((a) => a.meta.title);
    // Group 0 comes before Group 2.
    // Within Group 0: sorted by status name ("approved" < "draft"), then title.
    expect(titles).toEqual(["zebra", "alpha", "gamma", "beta"]);
  });
});
