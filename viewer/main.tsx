import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Excalidraw } from "@excalidraw/excalidraw";

interface SceneData {
  elements: readonly object[];
  appState: Record<string, unknown>;
}

function App() {
  const [scene, setScene] = useState<SceneData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/scene.json")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) =>
        setScene({
          elements: data.elements,
          appState: { ...data.appState, scrollToContent: true },
        }),
      )
      .catch((err) => setError(String(err)));
  }, []);

  if (error) {
    return (
      <div style={{ padding: 32, fontFamily: "sans-serif" }}>
        <h2>Failed to load scene</h2>
        <pre>{error}</pre>
      </div>
    );
  }
  if (!scene) return null;

  return (
    <div style={{ height: "100vh" }}>
      <Excalidraw
        initialData={{
          elements: scene.elements as never,
          appState: scene.appState as never,
          scrollToContent: true,
        }}
      />
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
