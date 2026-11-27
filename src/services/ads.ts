// Metro resuelve automáticamente `ads.native.ts` o `ads.web.ts` según la
// plataforma. Este archivo solo existe para que TypeScript encuentre el módulo
// al importar `./ads` sin extensión.
export { initializeAds, showBookAd } from './ads.native';
