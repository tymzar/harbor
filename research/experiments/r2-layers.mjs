// r2-layers: which visual-layer properties get their own compositor layer? (CDP LayerTree)
import { withPage } from './r2-harness.mjs'
const html = `<!doctype html><style>
body{margin:0;background:#111}
.b{width:80px;height:80px;background:#4af;margin:10px;display:inline-block}
@property --a{syntax:'<number>';inherits:false;initial-value:0.3}
#t{will-change:transform;transform:scale(calc(0.5 + var(--a)))}
#o{will-change:opacity;opacity:calc(0.2 + var(--a))}
#f{will-change:filter;filter:hue-rotate(calc(var(--a)*360deg)) saturate(2)}
#bg{background:conic-gradient(#f00 calc(var(--a)*360deg), #00f 0)}
#w{width:calc(50px + var(--a)*100px)}
#plain{}
#anim{animation:spin 2s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
#animbg{animation:bgc 2s linear infinite}
@keyframes bgc{to{background:#f0f}}
</style>
<div class="b" id="t"></div><div class="b" id="o"></div><div class="b" id="f"></div><div class="b" id="bg"></div><div class="b" id="w"></div><div class="b" id="plain"></div><div class="b" id="anim"></div><div class="b" id="animbg"></div>`
await withPage(async page => {
  await page.setContent(html)
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('DOM.enable'); await cdp.send('CSS.enable')
  const layersP = new Promise(res => cdp.on('LayerTree.layerTreeDidChange', e => res(e.layers)))
  await cdp.send('LayerTree.enable')
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))))
  const layers = await layersP
  const { root } = await cdp.send('DOM.getDocument')
  const ids = ['t', 'o', 'f', 'bg', 'w', 'plain', 'anim', 'animbg']
  const map = {}
  for (const id of ids) {
    const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: '#' + id })
    const { backendNodeId } = (await cdp.send('DOM.describeNode', { nodeId })).node
    map[id] = layers.filter(l => l.backendNodeId === backendNodeId)
  }
  for (const id of ids) {
    let reasons = null
    if (map[id].length) {
      try { reasons = (await cdp.send('LayerTree.compositingReasons', { layerId: map[id][0].layerId })).compositingReasons } catch (e) { reasons = e.message }
    }
    console.log(id.padEnd(8), map[id].length ? 'OWN LAYER' : 'no layer ', JSON.stringify(reasons))
  }
  console.log('total layers', layers.length)
})
