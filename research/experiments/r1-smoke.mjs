import { withPage } from './r1-harness.mjs'
await withPage(async page => {
  const info = await page.evaluate(() => ({
    ua: navigator.userAgent,
    supports: {
      animationTimeline: CSS.supports('animation-timeline: scroll()'),
      viewTimeline: CSS.supports('view-timeline-name: --a'),
      anchor: CSS.supports('anchor-name: --a'),
      containerStyle: CSS.supports('container-type: inline-size'),
      linear: CSS.supports('animation-timing-function: linear(0, 1)'),
      composition: CSS.supports('animation-composition: add'),
      registerProperty: typeof CSS.registerProperty === 'function',
      sibling: CSS.supports('width: calc(sibling-index() * 1px)'),
      offsetPath: CSS.supports('offset-path: path("M0 0")'),
      cqw: CSS.supports('width: 1cqw'),
      round: CSS.supports('width: round(1px, 1px)'),
      sign: CSS.supports('width: calc(sign(1) * 1px)'),
      ifFn: CSS.supports('width: if(style(--a: 1): 1px; else: 2px)'),
      progress: CSS.supports('width: calc(progress(1px, 0px, 2px) * 1px)'),
      interpolateSize: CSS.supports('interpolate-size: allow-keywords'),
    },
  }))
  console.log(JSON.stringify(info, null, 2))
})
