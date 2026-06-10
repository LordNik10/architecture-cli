export interface Signal {
  /** Detector that produced this, e.g. "js", "jvm", "infra". */
  source: string;
  /** Short human-readable finding, e.g. "pnpm monorepo (4 packages)". */
  summary: string;
}

export interface ScanResult {
  rootDir: string;
  tree: string;
  treeTruncated: boolean;
  /** All listed relative file paths. */
  files: string[];
  signals: Signal[];
  /** Relative paths of manifests/key files the detectors deem relevant. */
  keyFilePaths: string[];
}

export type FileReader = (relPath: string) => string | null;

export interface Detector {
  name: string;
  detect(files: string[], read: FileReader): { signals: Signal[]; keyFiles: string[] };
}
