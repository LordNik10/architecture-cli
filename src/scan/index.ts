import { jsDetector } from "./detectors/js.js";
import { jvmDetector } from "./detectors/jvm.js";
import { infraDetector } from "./detectors/infra.js";
import { readProjectFile, walkProject } from "./walker.js";
import type { FileReader, ScanResult } from "./types.js";

const DETECTORS = [jsDetector, jvmDetector, infraDetector];

export function scanProject(rootDir: string): ScanResult {
  const { files, tree, truncated } = walkProject(rootDir);
  const read: FileReader = (relPath) => readProjectFile(rootDir, relPath);

  const signals = [];
  const keyFilePaths = [];
  for (const detector of DETECTORS) {
    const result = detector.detect(files, read);
    signals.push(...result.signals);
    keyFilePaths.push(...result.keyFiles);
  }

  return { rootDir, tree, treeTruncated: truncated, files, signals, keyFilePaths };
}

export function makeReader(rootDir: string): FileReader {
  return (relPath) => readProjectFile(rootDir, relPath);
}
