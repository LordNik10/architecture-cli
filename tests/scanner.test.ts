import path from "node:path";
import { describe, expect, it } from "vitest";
import { makeReader, scanProject } from "../src/scan/index.js";
import { buildPayload, envKeysOnly, sanitizeCompose } from "../src/scan/key-files.js";

const fixture = (name: string) => path.join(__dirname, "fixtures", name);

describe("scanProject", () => {
  it("detects compose services", () => {
    const scan = scanProject(fixture("compose-stack"));
    const summaries = scan.signals.map((s) => s.summary).join("\n");
    expect(summaries).toContain("docker-compose");
    expect(summaries).toContain("web");
    expect(summaries).toContain("broker");
    expect(scan.keyFilePaths).toContain("docker-compose.yml");
  });

  it("detects a pnpm/turbo monorepo with frameworks", () => {
    const scan = scanProject(fixture("js-monorepo"));
    const summaries = scan.signals.map((s) => s.summary).join("\n");
    expect(summaries).toContain("@shop/web (Next.js, React)");
    expect(summaries).toContain("@shop/api (NestJS)");
    expect(summaries).toContain("pnpm-workspace.yaml");
    expect(summaries).toContain("turbo.json");
  });

  it("detects maven modules and gradle spring modules", () => {
    const scan = scanProject(fixture("jvm-multimodule"));
    const summaries = scan.signals.map((s) => s.summary).join("\n");
    expect(summaries).toContain("shop-parent (2 modules)");
    expect(summaries).toContain("orders-service");
    expect(summaries).toMatch(/Spring Web.*JPA|JPA.*Spring Web/);
    expect(summaries).toContain("Kafka");
    expect(summaries).toContain("Spring Boot");
  });
});

describe("payload privacy", () => {
  it("never includes source files, .env values, or compose env values", () => {
    const root = fixture("compose-stack");
    const payload = buildPayload(scanProject(root), makeReader(root));

    expect(payload).not.toContain("DO_NOT_LEAK");
    expect(payload).not.toContain("supersecret");
    expect(payload).not.toContain("guestpw");
    expect(payload).not.toContain("SUPER_SECRET_TOKEN");
    expect(payload).not.toContain("example_value_should_be_stripped");

    // structure still present
    expect(payload).toContain("DIRECTORY TREE");
    expect(payload).toContain("docker-compose.yml");
    expect(payload).toContain("DATABASE_URL");
    expect(payload).toContain("API_KEY");
  });
});

describe("sanitizers", () => {
  it("masks compose environment values in both syntaxes", () => {
    const sanitized = sanitizeCompose(
      [
        "services:",
        "  a:",
        "    environment:",
        "      SECRET: value1",
        "  b:",
        "    environment:",
        "      - TOKEN=value2",
      ].join("\n"),
    );
    expect(sanitized).not.toContain("value1");
    expect(sanitized).not.toContain("value2");
    expect(sanitized).toContain("SECRET");
    expect(sanitized).toContain("TOKEN");
  });

  it("envKeysOnly strips values and comments", () => {
    expect(envKeysOnly("# comment\nA=1\n\nB=two words")).toBe("A\nB");
  });
});
