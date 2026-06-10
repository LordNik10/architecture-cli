import { XMLParser } from "fast-xml-parser";
import type { Detector, FileReader, Signal } from "../types.js";

const SPRING_HINTS: Record<string, string> = {
  "spring-boot-starter-web": "Spring Web",
  "spring-boot-starter-webflux": "Spring WebFlux",
  "spring-boot-starter-data-jpa": "JPA",
  "spring-boot-starter-data-mongodb": "MongoDB",
  "spring-boot-starter-data-redis": "Redis",
  "spring-kafka": "Kafka",
  "spring-boot-starter-amqp": "RabbitMQ",
  "spring-cloud-starter-gateway": "Spring Cloud Gateway",
  postgresql: "PostgreSQL",
  "mysql-connector": "MySQL",
};

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

export const jvmDetector: Detector = {
  name: "jvm",
  detect(files: string[], read: FileReader) {
    const signals: Signal[] = [];
    const keyFiles: string[] = [];
    const parser = new XMLParser({ ignoreAttributes: true });

    const poms = files
      .filter((f) => f === "pom.xml" || f.endsWith("/pom.xml"))
      .slice(0, 20);
    for (const pomPath of poms) {
      const raw = read(pomPath);
      if (!raw) continue;
      keyFiles.push(pomPath);
      try {
        const doc = parser.parse(raw);
        const project = doc?.project ?? {};
        const artifactId = project.artifactId ?? pomPath;
        const modules = asArray(project.modules?.module);
        const depList = asArray(project.dependencies?.dependency)
          .map((d: { artifactId?: string }) => String(d?.artifactId ?? ""))
          .filter(Boolean);
        const hints = Object.entries(SPRING_HINTS)
          .filter(([dep]) => depList.some((d) => d.includes(dep)))
          .map(([, label]) => label);
        const detail = [
          modules.length > 0 ? `${modules.length} modules` : null,
          hints.length > 0 ? hints.join(", ") : null,
        ]
          .filter(Boolean)
          .join("; ");
        signals.push({
          source: "jvm",
          summary: `Maven project: ${artifactId}${detail ? ` (${detail})` : ""}`,
        });
      } catch {
        // unparseable pom still goes to the LLM as a key file
      }
    }

    const gradleFiles = files
      .filter((f) => /(^|\/)(settings|build)\.gradle(\.kts)?$/.test(f))
      .slice(0, 20);
    for (const gradlePath of gradleFiles) {
      const raw = read(gradlePath);
      if (!raw) continue;
      keyFiles.push(gradlePath);
      if (/(^|\/)settings\.gradle(\.kts)?$/.test(gradlePath)) {
        const includes = [...raw.matchAll(/include\s*[( ]\s*["']([^"']+)["']/g)].map(
          (m) => m[1],
        );
        if (includes.length > 0) {
          signals.push({
            source: "jvm",
            summary: `Gradle multi-module build: ${includes.length} modules (${gradlePath})`,
          });
        }
      } else {
        const deps = [
          ...raw.matchAll(/(?:implementation|api|runtimeOnly)\s*[( ]\s*["']([^"']+)["']/g),
        ].map((m) => m[1] ?? "");
        const hints = Object.entries(SPRING_HINTS)
          .filter(([dep]) => deps.some((d) => d.includes(dep)))
          .map(([, label]) => label);
        const isSpringBoot = /org\.springframework\.boot/.test(raw);
        if (isSpringBoot || hints.length > 0) {
          signals.push({
            source: "jvm",
            summary: `Gradle module ${gradlePath}${isSpringBoot ? " (Spring Boot)" : ""}${
              hints.length > 0 ? `: ${hints.join(", ")}` : ""
            }`,
          });
        }
      }
    }

    return { signals, keyFiles };
  },
};
