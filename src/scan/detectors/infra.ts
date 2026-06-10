import YAML from "yaml";
import type { Detector, FileReader, Signal } from "../types.js";

export const infraDetector: Detector = {
  name: "infra",
  detect(files: string[], read: FileReader) {
    const signals: Signal[] = [];
    const keyFiles: string[] = [];

    const composeFiles = files
      .filter((f) => /(^|\/)(docker-)?compose[^/]*\.ya?ml$/.test(f))
      .slice(0, 5);
    for (const composePath of composeFiles) {
      const raw = read(composePath);
      if (!raw) continue;
      keyFiles.push(composePath);
      try {
        const doc = YAML.parse(raw);
        const services = Object.keys(doc?.services ?? {});
        if (services.length > 0) {
          signals.push({
            source: "infra",
            summary: `docker-compose (${composePath}): services ${services.join(", ")}`,
          });
        }
      } catch {
        // still forwarded as key file
      }
    }

    const dockerfiles = files
      .filter((f) => /(^|\/)Dockerfile[^/]*$/.test(f))
      .slice(0, 10);
    for (const dockerPath of dockerfiles) {
      const raw = read(dockerPath);
      if (!raw) continue;
      keyFiles.push(dockerPath);
      const from = [...raw.matchAll(/^FROM\s+(\S+)/gim)].map((m) => m[1]);
      const expose = [...raw.matchAll(/^EXPOSE\s+(.+)$/gim)].map((m) => m[1]);
      signals.push({
        source: "infra",
        summary: `Dockerfile ${dockerPath}: FROM ${from.join(", ") || "?"}${
          expose.length > 0 ? `, EXPOSE ${expose.join(" ")}` : ""
        }`,
      });
    }

    // Kubernetes / Helm: look at yaml files with a `kind:` field, plus Chart.yaml
    const yamlFiles = files.filter(
      (f) => /\.ya?ml$/.test(f) && !composeFiles.includes(f),
    );
    const k8sKinds = new Set<string>();
    let k8sFileCount = 0;
    for (const yamlPath of yamlFiles.slice(0, 200)) {
      if (/(^|\/)Chart\.yaml$/.test(yamlPath)) {
        keyFiles.push(yamlPath);
        signals.push({ source: "infra", summary: `Helm chart: ${yamlPath}` });
        continue;
      }
      const raw = read(yamlPath);
      if (!raw || !/^kind:\s*\w+/m.test(raw) || !/^apiVersion:/m.test(raw)) continue;
      k8sFileCount++;
      for (const m of raw.matchAll(/^kind:\s*(\w+)/gm)) {
        k8sKinds.add(m[1]!);
      }
      if (k8sFileCount <= 10) keyFiles.push(yamlPath);
    }
    if (k8sKinds.size > 0) {
      signals.push({
        source: "infra",
        summary: `Kubernetes manifests (${k8sFileCount} files): ${[...k8sKinds].join(", ")}`,
      });
    }

    // Terraform: signals only — .tf files may embed sensitive defaults, so
    // their content never reaches the payload.
    const tfFiles = files.filter((f) => f.endsWith(".tf"));
    const providers = new Set<string>();
    const resourceTypes = new Set<string>();
    for (const tfPath of tfFiles.slice(0, 100)) {
      const raw = read(tfPath);
      if (!raw) continue;
      for (const m of raw.matchAll(/provider\s+"([^"]+)"/g)) providers.add(m[1]!);
      for (const m of raw.matchAll(/resource\s+"([^"]+)"/g)) resourceTypes.add(m[1]!);
    }
    if (providers.size > 0 || resourceTypes.size > 0) {
      signals.push({
        source: "infra",
        summary: `Terraform: providers [${[...providers].join(", ")}], resources [${[
          ...resourceTypes,
        ]
          .slice(0, 15)
          .join(", ")}]`,
      });
    }

    return { signals, keyFiles };
  },
};
