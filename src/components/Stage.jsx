import { useEffect, useRef } from "react";
import { getScene } from "../scene/sceneInstance.js";

export default function Stage({ mode }) {
  const ref = useRef(null);
  useEffect(() => {
    const scene = getScene();
    scene.mount(ref.current);
    scene.setMode(mode);
  }, [mode]);
  return <div className="stage" ref={ref} />;
}
