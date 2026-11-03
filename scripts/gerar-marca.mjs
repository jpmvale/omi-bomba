/**
 * Gera `app/public/og.png` (cartão do convite, 1200×630) e `icone.png`
 * (512×512) a partir de HTML, com o Chromium já instalado na máquina.
 *
 *   NODE_PATH=$(npm root -g) node scripts/gerar-marca.mjs
 *
 * Os PNGs vão para o git: são estáticos e quase nunca mudam. O Playwright não
 * é dependência do projeto; rode onde ele estiver disponível.
 */

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

// `require` e não `import`: assim acha o Playwright global pelo NODE_PATH.
const { chromium } = createRequire(import.meta.url)('playwright');

const publico = fileURLToPath(new URL('../app/public/', import.meta.url));
const bomba = readFileSync(`${publico}favicon.svg`, 'utf8');

const og = `<!doctype html><html><body style="margin:0">
<div style="width:1200px;height:630px;background:radial-gradient(ellipse at 72% 50%,#3a2410 0%,#1a1208 45%,#080b14 100%);font-family:Inter,system-ui,sans-serif;color:#f1ece4;display:flex;align-items:center;padding:0 90px;box-sizing:border-box;gap:50px">
  <div style="flex:1">
    <div style="font-size:118px;font-weight:700;letter-spacing:-4px;line-height:1">Omi<span style="color:#ffb000">Bomba</span></div>
    <div style="font-size:38px;color:#c8bfb2;margin-top:26px;line-height:1.3">Bombas, fogo e caixas.<br>Até 5 na arena, pelo link.</div>
  </div>
  <div style="position:relative;width:420px;height:420px">
    <div style="position:absolute;inset:40px">${bomba.replace('<svg ', '<svg width="340" height="340" ')}</div>
  </div>
</div></body></html>`;

const icone = `<!doctype html><html><body style="margin:0;background:#080b14">
${bomba.replace('<svg ', '<svg width="512" height="512" ')}
</body></html>`;

const navegador = await chromium.launch();
const pagina = await navegador.newPage();
for (const [nome, html, largura, altura] of [['og.png', og, 1200, 630], ['icone.png', icone, 512, 512]]) {
  await pagina.setViewportSize({ width: largura, height: altura });
  await pagina.setContent(html);
  await pagina.screenshot({ path: `${publico}${nome}`, clip: { x: 0, y: 0, width: largura, height: altura } });
  console.log(`gerado ${nome}`);
}
await navegador.close();
