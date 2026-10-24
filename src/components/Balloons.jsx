import { useEffect, useRef } from "react";
import { getScene } from "../scene/sceneInstance.js";

// Callouts with a leader line to a part, re-projected every frame so they follow it as the camera moves.
// items: [{ sku, n?, label, dx, dy }] where dx/dy offset the callout from the part in pixels.
export default function Balloons({ items }) {
  const lines = useRef([]);
  const dots = useRef([]);
  const tags = useRef([]);

  useEffect(() => {
    const scene = getScene();
    return scene.onFrame(() => {
      items.forEach((it, i) => {
        const line = lines.current[i], dot = dots.current[i], tag = tags.current[i];
        if (!line || !dot || !tag) return;
        const p = scene.project(it.sku);
        const visible = p ? "1" : "0";
        line.style.opacity = dot.style.opacity = tag.style.opacity = visible;
        if (!p) return;
        const bx = p.x + it.dx, by = p.y + it.dy;
        line.setAttribute("x1", p.x);
        line.setAttribute("y1", p.y);
        line.setAttribute("x2", bx);
        line.setAttribute("y2", by);
        dot.setAttribute("cx", p.x);
        dot.setAttribute("cy", p.y);
        tag.style.transform = `translate(${bx}px, ${by}px)`;
      });
    });
  }, [items]);

  return (
    <div className="balloons" aria-hidden="true">
      <svg>
        {items.map((it, i) => (
          <g key={it.sku}>
            <line ref={(el) => (lines.current[i] = el)} />
            <circle ref={(el) => (dots.current[i] = el)} r="2.5" />
          </g>
        ))}
      </svg>
      {items.map((it, i) => (
        <div key={it.sku} className="balloon" ref={(el) => (tags.current[i] = el)}>
          {it.n && <b>{it.n}</b>}
          {it.label && <span>{it.label}</span>}
        </div>
      ))}
    </div>
  );
}
