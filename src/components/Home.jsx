import { useMemo, useState } from "react";
import { BY_SKU, PARTS, money, shortName } from "../lib/catalog.js";
import { bomOrder } from "../lib/build.js";
import { kindOf } from "../scene/placeholders.js";
import Stage from "./Stage.jsx";
import Balloons from "./Balloons.jsx";
import { PRESETS } from "../lib/preset.js";

const EXAMPLES = ["Mecanum drivetrain that can strafe", "Rover with a servo claw arm", "4-wheel rover under $250"];
const MARQUEE = PARTS.filter((p, i) => p.img && i % 2 === 0).slice(0, 26);
const CALLOUTS = [
  ["motor", -150, -90],
  ["wheel", 130, 90],
];

export default function Home({ build, onStart, onPreset, onBlank }) {
  const [text, setText] = useState("");

  const callouts = useMemo(() => {
    const bom = bomOrder(build);
    return CALLOUTS.flatMap(([kind, dx, dy]) => {
      const line = bom.find(([sku]) => kindOf(BY_SKU[sku]) === kind);
      if (!line) return [];
      const [sku, qty] = line;
      return [{ sku, label: `${qty}× ${shortName(BY_SKU[sku].name).replace(/^\d{4} Series /, "")}`, dx, dy }];
    });
  }, [build]);

  return (
    <section className="home">
      <div className="copy">
        <h1>
          Building blocks for <em>real robots.</em>
        </h1>
        <p className="lede">
          Snap together parts that are guaranteed to fit. BrickBots tracks your total as you build and finds the best price for every piece, all in one place.
        </p>
        <form
          className="ask"
          onSubmit={(e) => {
            e.preventDefault();
            if (text.trim()) onStart(text.trim());
          }}
        >
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Describe your robot, e.g. a 4-wheel rover under $250" aria-label="Describe your robot" autoComplete="off" />
          <button className="go" type="submit" disabled={!text.trim()}>
            Build it →
          </button>
        </form>
        <div className="presets">
          <span className="presets-label">Or start from a finished build</span>
          <div className="preset-row">
            {PRESETS.map((preset) => (
              <button key={preset.id} type="button" className="preset" title={preset.blurb} onClick={() => onPreset(preset)}>
                <b>{preset.name}</b>
                <span>{preset.blurb}</span>
                <em>{preset.parts.length} parts · {preset.mates.length} connections checked</em>
              </button>
            ))}
          </div>
          <button type="button" className="blank-canvas" onClick={onBlank}>Start a blank canvas</button>
        </div>
        <div className="examples">
          {EXAMPLES.map((ex) => (
            <button key={ex} type="button" onClick={() => onStart(ex)}>
              {ex}
            </button>
          ))}
        </div>
      </div>

      <div className="herostage">
        <Stage mode="home" />
        <Balloons items={callouts} />
      </div>

      <div className="marquee" aria-hidden="true">
        <div className="track">
          {[...MARQUEE, ...MARQUEE].map((p, i) => (
            <div className="mq" key={i}>
              <img src={p.img} alt="" loading="lazy" />
              <span>{shortName(p.name)}</span>
              <b>{money(p.price)}</b>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
