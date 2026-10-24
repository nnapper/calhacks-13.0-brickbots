import {useState} from 'react';
import {GROUPS,searchParts,money} from '../lib/catalog.js';
export function CatalogBrowser(){
 const [query,setQuery]=useState(''),[group,setGroup]=useState('all');
 const results=searchParts(query,group);
 return <section className="catalog-browser"><div className="section-label">PRODUCT DATABASE <a href="/catalog.html">Build & compare sellers ↗</a></div><input aria-label="Search product database" placeholder="Search products, specs…" value={query} onChange={e=>setQuery(e.target.value)}/><select aria-label="Product category" value={group} onChange={e=>setGroup(e.target.value)}>{GROUPS.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select><p>{results.length} products · retailer prices in USD</p><div className="catalog-results">{results.map(p=><a key={p.sku} href={p.url} target="_blank" rel="noreferrer" className="catalog-product">{p.img&&<img src={p.img} alt="" loading="lazy"/>}<span>{p.name}<small>{money(p.price)} · {p.offers.length} seller{p.offers.length===1?'':'s'}</small></span></a>)}</div><p>Product photos and dimensions are reference data. Import a STEP, STL, or GLB for accurate CAD assembly.</p></section>;
}
