#!/usr/bin/env node
/**
 * build-sla.js — monta a tela de SLA do ciclo, unica e autocontida.
 *
 *   src/sla.template.html + src/app.css + src/shared.js + src/sla.js + data/sla.json
 *        -> dist/SLA_Painel.html
 *
 * Tela SEPARADA do painel de prejuizo, por enquanto so local (validacao): nao entra
 * no build.js nem no fluxo do GitHub. Reaproveita o app.css e os componentes de
 * src/shared.js para manter o mesmo visual.
 *
 * Uso:  node build-sla.js            -> dist/SLA_Painel.html (arquivo de trabalho)
 *       node build-sla.js --envio    -> dist/SLA_Prejuizo_AAAA-MM-DD.html (para mandar a outra pessoa)
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { logoDataUri } = require('./build-lib');

const ROOT = __dirname;
const p = (...a) => path.join(ROOT, ...a);
const read = f => fs.readFileSync(p(f), 'utf8');
const semQuebraFinal = s => s.replace(/\r?\n$/, '');

const faltando = ['src/sla.template.html', 'src/app.css', 'src/shared.js', 'src/sla.js', 'data/sla.json']
  .filter(f => !fs.existsSync(p(f)));
if (faltando.length) {
  console.error('Faltam arquivos:\n  ' + faltando.join('\n  '));
  console.error('\nRode  node extract/sla.js  para gerar o payload a partir do Jira.');
  process.exit(1);
}

const txt = read('data/sla.json').trim();
let obj;
try { obj = JSON.parse(txt); } catch (e) { console.error('data/sla.json invalido: ' + e.message); process.exit(1); }

/* --envio: versao para mandar a outra pessoa. Sem o link "Painel de prejuizo" (aponta para um arquivo
   que quem recebe nao tem) e com nome datado, para nao confundir com o arquivo de trabalho. */
const envio = process.argv.includes('--envio');
const LINK_PAINEL = '    <a class="btn" href="SDPREJ_Painel.html" title="Voltar ao painel de prejuízo">←<span class="lbl"> Painel de prejuízo</span></a>';

let html = read('src/sla.template.html')
  .replace('@@CSS@@',  () => semQuebraFinal(read('src/app.css')))
  .replace('@@DATA@@', () => `const SL = ${txt};`)
  .replace('@@JS@@',   () => semQuebraFinal(read('src/shared.js')) + '\n' + semQuebraFinal(read('src/sla.js')))
  .replace('@@LOGOCVC@@', () => logoDataUri())
  .replace('@@LINKPAINEL@@', () => envio ? '' : LINK_PAINEL);

const sobrou = html.match(/@@[A-Z]+@@/g);
if (sobrou) { console.error('Marcador nao substituido: ' + [...new Set(sobrou)].join(', ')); process.exit(1); }

html = html.replace(/\r?\n*$/, '') + '\n';
fs.mkdirSync(p('dist'), { recursive: true });
const destino = p('dist', envio ? `SLA_Prejuizo_${String(obj.geradoEm).slice(0, 10)}.html` : 'SLA_Painel.html');
fs.writeFileSync(destino, html, 'utf8');
const enc = obj.rows.filter(r => r.d).length;
console.log('tela de SLA montada: ' + destino);
console.log('  tamanho  ' + (Buffer.byteLength(html) / 1024).toFixed(0) + ' KB');
console.log('  extraido em ' + obj.geradoEm + '  (' + obj.rows.length + ' chamados: ' + enc + ' encerrados, ' + (obj.rows.length - enc) + ' em aberto)');
