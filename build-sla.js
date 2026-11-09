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
 *       node build-sla.js --publico  -> docs/index.html ANONIMIZADO (GitHub Pages; pode ser comitado)
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

/* --publico: versao ANONIMIZADA para o GitHub Pages (site publico). O que sai do payload:
     - nome de analista  -> "Analista NN" (ordem embaralhada com semente fixa: o codigo nao segue o alfabeto)
     - chave do chamado  -> "CH-n" (mantem a ordem; sem link para o Jira)
     - resumo do chamado -> omitido (traz localizador de reserva)
     - valor do prejuizo -> zerado e ocultado na tela (R$ vira "—", o cartao de prejuizo some)
     - JQL               -> omitida (traz id de projeto e campos internos)
   O que fica: contagens, datas, tempos, tema/produto/natureza/area e status (metricas agregadas).
   Depois de montar, uma conferencia varre o HTML e ABORTA se sobrou nome, chave ou dominio do Jira. */
const publico = process.argv.includes('--publico');
function anonimiza(o) {
  const c = JSON.parse(JSON.stringify(o));
  let seed = 20260101;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const ord = c.analistas.map((_, i) => i);
  for (let i = ord.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [ord[i], ord[j]] = [ord[j], ord[i]]; }
  c.analistas = c.analistas.map((_, i) => 'Analista ' + String(ord[i] + 1).padStart(2, '0'));
  const num = k => Number(String(k).split('-')[1]);
  const rank = new Map([...c.rows].sort((a, b) => num(a.k) - num(b.k)).map((r, i) => [r.k, i + 1]));
  c.rows.forEach(r => { r.k = 'CH-' + rank.get(r.k); r.m = '(resumo omitido)'; r.v = 0; });
  c.jql = '(omitida na versão pública)';
  return c;
}
const nomesReais = obj.analistas.slice();
if (publico) { obj = anonimiza(obj); }

/* --envio: versao para mandar a outra pessoa. Sem o link "Painel de prejuizo" (aponta para um arquivo
   que quem recebe nao tem) e com nome datado, para nao confundir com o arquivo de trabalho. */
const envio = process.argv.includes('--envio');
const LINK_PAINEL = '    <a class="btn" href="SDPREJ_Painel.html" title="Voltar ao painel de prejuízo">←<span class="lbl"> Painel de prejuízo</span></a>';

/* publico: sem valores em R$ e sem link para o Jira (as chaves "CH-n" nao existem la) */
function sharedPublico(js) {
  const subst = (re, novo) => { if (!re.test(js)) { console.error('shared.js mudou: nao achei ' + re); process.exit(1); } js = js.replace(re, () => novo); };
  subst(/const nfBRL=.*;/, "const nfBRL={format:()=>'—'};");
  subst(/const nfBRL2=.*;/, "const nfBRL2={format:()=>'—'};");
  subst(/const fmtBRL=.*;/, "const fmtBRL=()=>'—';");
  subst(/const fmtBRLCompact=.*;/, "const fmtBRLCompact=()=>'—';");
  subst(/const JIRA=.*;/, "const JIRA='#';");
  return semQuebraFinal(js);
}
const EXTRA_PUBLICO = `(function(){
  var q=function(){document.querySelectorAll('.tile').forEach(function(t){var k=t.querySelector('.k');if(k&&/^Preju[ií]zo fora/i.test(k.textContent))t.remove();});};
  new MutationObserver(q).observe(document.body,{childList:true,subtree:true});q();
})();`;
const AVISO_PUBLICO = '<div class="conf val">\n  <b>VERSÃO PÚBLICA ANONIMIZADA.</b> Nomes de analistas foram trocados por códigos, chaves e resumos dos chamados foram omitidos e os valores em R$ não são exibidos.\n  Os tempos de atuação são <b>estimativas</b> e a meta de SLA é um <b>parâmetro desta tela</b>, não um dado do Jira.\n</div>';
let html = read('src/sla.template.html')
  .replace('@@CSS@@',  () => semQuebraFinal(read('src/app.css')))
  .replace('@@DATA@@', () => `const SL = ${publico ? JSON.stringify(obj) : txt};`)
  .replace('@@JS@@',   () => (publico ? sharedPublico(read('src/shared.js')) : semQuebraFinal(read('src/shared.js'))) + '\n' + semQuebraFinal(read('src/sla.js')) + (publico ? '\n' + EXTRA_PUBLICO : ''))
  .replace('@@LOGOCVC@@', () => logoDataUri())
  .replace('@@LINKPAINEL@@', () => (envio || publico) ? '' : LINK_PAINEL);

if (publico) {
  html = html
    .replace(/<div class="conf">[\s\S]*?<\/div>\s*<div class="conf val">[\s\S]*?<\/div>/, () => AVISO_PUBLICO)
    .replace(/<b>Dado pessoal:<\/b>[\s\S]*?(?=<br>|\n<\/footer>|<\/footer>)/g, () => '<b>Versão pública:</b> nomes trocados por códigos; chaves, resumos e valores omitidos.')
    .replace(/Uso interno \(validação\)/, () => 'Versão pública anonimizada')
    .replace(/ — Uso interno \(validação\)/, () => ' — Versão pública anonimizada');
  /* trava: nada identificavel pode sobrar no arquivo que vai para um site publico */
  const proibidos = [
    ...nomesReais.map(n => [n, 'nome de analista']),
    [/SDPREJ-\d/, 'chave de chamado'], [/atlassian\.net/i, 'dominio do Jira'], [/cvccorp\.com\.br/i, 'e-mail corporativo'],
    [/project\s*=\s*\d/, 'JQL do projeto'], [/CONFIDENCIAL/, 'aviso de confidencial (versao interna)'],
  ];
  const achados = proibidos.filter(([x]) => (x instanceof RegExp ? x.test(html) : html.includes(x)));
  if (achados.length) {
    console.error('ABORTADO: a versão pública ainda contém dado identificável:\n  ' + achados.map(a => a[1] + ' (' + String(a[0]).slice(0, 40) + ')').join('\n  '));
    process.exit(3);
  }
}
const sobrou = html.match(/@@[A-Z]+@@/g);
if (sobrou) { console.error('Marcador nao substituido: ' + [...new Set(sobrou)].join(', ')); process.exit(1); }

html = html.replace(/\r?\n*$/, '') + '\n';
const destino = publico ? p('docs', 'index.html') : p('dist', envio ? `SLA_Prejuizo_${String(obj.geradoEm).slice(0, 10)}.html` : 'SLA_Painel.html');
fs.mkdirSync(path.dirname(destino), { recursive: true });
fs.writeFileSync(destino, html, 'utf8');
if (publico) fs.writeFileSync(p('docs', '.nojekyll'), '');
const enc = obj.rows.filter(r => r.d).length;
console.log('tela de SLA montada: ' + destino);
console.log('  tamanho  ' + (Buffer.byteLength(html) / 1024).toFixed(0) + ' KB');
console.log('  extraido em ' + obj.geradoEm + '  (' + obj.rows.length + ' chamados: ' + enc + ' encerrados, ' + (obj.rows.length - enc) + ' em aberto)');
