import { BuildScene } from "./BuildScene.js";

// Module-level singleton so React StrictMode's double render/effects never create a second WebGL context.
let instance = null;
export function getScene() {
  if (!instance) instance = new BuildScene();
  return instance;
}
