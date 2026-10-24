import { useEffect, useMemo, useRef, useState } from "react";
import { BY_SKU, PRICES_CHECKED, bestOfferIndex, money, shortName } from "../lib/catalog.js";
import { bomOrder } from "../lib/build.js";
import { CloseIcon } from "./Icons.jsx";

const STOCK = { true: "In stock", false: "Out of stock", null: "Stock unknown" };

// Where-to-buy receipt: every part in the build with each seller's price, defaulting to the best offer.
export default function Receipt({ open, build, buildName, onClose, onToast }) {
  const [choice, setChoice] = useState({}); // sku -> index into part.offers
  const closeRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const lines = useMemo(
    () =>
      bomOrder(build).map(([sku, qty]) => {
        const part = BY_SKU[sku];
        const best = bestOfferIndex(part.offers);
        const chosen = choice[sku] ?? best;
        return { sku, qty, part, best, chosen, offer: part.offers[chosen] };
      }),
    [build, choice]
  );

  const total = lines.reduce((s, l) => s + l.offer.priceUsd * l.qty, 0);
  const stores = Object.values(
    lines.reduce((acc, l) => {
      const s = (acc[l.offer.store] ??= { store: l.offer.store, items: 0, subtotal: 0, lines: [] });
      s.items += l.qty;
      s.subtotal += l.offer.priceUsd * l.qty;
      s.lines.push(l);
      return acc;
    }, {})
  ).sort((a, b) => b.subtotal - a.subtotal);
  const allBest = lines.every((l) => l.chosen === l.best);

  const copyList = () => {
    const text = [
      `BrickBots parts list${buildName ? `: ${buildName}` : ""}`,
      ...stores.flatMap((s) => [
        "",
        `${s.store} (${s.items} items, ${money(s.subtotal)})`,
        ...s.lines.map((l) => `  ${l.qty}x ${shortName(l.part.name)} [${l.sku}] ${money(l.offer.price, l.offer.currency)} each  ${l.offer.url}`),
      ]),
      "",
      `Total ${money(total)} before shipping and tax`,
    ].join("\n");
    navigator.clipboard.writeText(text).then(
      () => onToast("Shopping list copied"),
      () => onToast("Couldn't copy. Select the list in the receipt instead.")
    );
  };

  return (
    <div className={`checkout${open ? " open" : ""}`}>
      <div className="scrim" onClick={onClose} />
      <aside className="drawer receipt" aria-label="Where to buy" aria-hidden={!open}>
        <div className="dh">
          <div>
            <h2>Where to buy</h2>
            <p>
              {buildName || "Your build"}
              {PRICES_CHECKED && ` · prices checked ${PRICES_CHECKED}`}
            </p>
          </div>
          <button ref={closeRef} className="iconbtn" type="button" onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </div>

        <div className="db">
          <ol className="rlines">
            {lines.map((l, n) => (
              <li key={l.sku}>
                <div className="rhead">
                  <span className="no">{n + 1}</span>
                  <span className="rn" title={l.part.name}>{shortName(l.part.name)}</span>
                  <span className="qty">×{l.qty}</span>
                  <span className="amt">{money(l.offer.priceUsd * l.qty)}</span>
                </div>
                <ul className="offers">
                  {l.part.offers.map((o, j) => {
                    const id = `offer-${l.sku}-${j}`;
                    const many = l.part.offers.length > 1;
                    return (
                      <li key={id} className={j === l.chosen ? "on" : undefined}>
                        {many ? (
                          <input type="radio" id={id} name={`offer-${l.sku}`} checked={j === l.chosen} onChange={() => setChoice((c) => ({ ...c, [l.sku]: j }))} />
                        ) : (
                          <span className="pip" />
                        )}
                        <label htmlFor={many ? id : undefined}>
                          <b>{o.store}</b>
                          <span className={`stock s-${o.inStock}`}>{STOCK[o.inStock]}</span>
                          {many && j === l.best && <span className="tag">Best price</span>}
                          {o.suspect && <span className="tag warn">Price looks off</span>}
                        </label>
                        <span className="each">
                          {money(o.price, o.currency)}
                          {o.currency !== "USD" && <small>≈ {money(o.priceUsd)}</small>}
                        </span>
                        <a href={o.url} target="_blank" rel="noreferrer">Buy ↗</a>
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ol>

          <h3 className="rsec">By store</h3>
          <table className="stores">
            <tbody>
              {stores.map((s) => (
                <tr key={s.store}>
                  <td>{s.store}</td>
                  <td className="num">{s.items} {s.items === 1 ? "item" : "items"}</td>
                  <td className="num">{money(s.subtotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="df">
          <div className="sum big"><span>Total</span><b>{money(total)}</b></div>
          <p className="fine">Before shipping and tax, which each store adds at its own checkout. Foreign prices are converted to USD.</p>
          <div className="dactions">
            {!allBest && (
              <button className="ghost" type="button" onClick={() => setChoice({})}>Use best prices</button>
            )}
            <button className="cta" type="button" onClick={copyList}>Copy shopping list</button>
          </div>
        </div>
      </aside>
    </div>
  );
}
