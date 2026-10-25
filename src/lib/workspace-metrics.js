// Only instances actually loaded into the CAD workspace contribute to these metrics.
export function workspaceMetrics(parts, mates, catalog) {
  let total = 0, pricedCount = 0, triangles = 0;
  const build = {};
  const rows = parts.map(part => {
    const product = catalog[part.model.asset.productId];
    const price = product && !product.custom && Number.isFinite(product.price) && product.price > 0 ? product.price : null;
    if (price !== null) { total += price; pricedCount++; }
    if (product && !product.custom && product.offers?.length) build[product.sku] = (build[product.sku] ?? 0) + 1;
    triangles += part.model.triangles;
    return {id: part.id, name: part.model.asset.name, price, product, dimensions:part.model.asset.bounds.max.map((v,i)=>(v-part.model.asset.bounds.min[i])*1000*(part.scale??1))};
  });
  const ids = new Set(parts.map(p=>p.id));
  return {rows, build, total, pricedCount, unpricedCount:parts.length-pricedCount, count:parts.length, triangles, connections:mates.filter(m=>ids.has(m.movingId)&&ids.has(m.targetId)).length};
}
