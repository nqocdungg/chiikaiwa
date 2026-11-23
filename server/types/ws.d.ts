// `@vercel/functions` re-exports `upgradeWebSocket` which references `ws` without
// declaring `@types/ws` as a runtime dependency, causing `tsc` (`checkJs`/`strict`)
// to descend into `node_modules/ws/index.js` without declarations.
declare module 'ws';
