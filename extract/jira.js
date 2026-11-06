'use strict';
/**
 * jira.js — acesso ao Jira Cloud da CVC.
 *
 * ARMADILHA que custou caro descobrir: o corpo do POST tem de ir como bytes
 * com o Content-Type declarado. Mandar Content-Type como header solto com o
 * corpo em string faz a API responder {"errorMessages":["Invalid request
 * payload..."]}. O fetch do Node faz isso certo desde que o body seja string
 * e o header venha junto — o que esta funcao garante num lugar so.
 *
 * Credencial: NUNCA fica em arquivo do repositorio. Vem de variavel de
 * ambiente (JIRA_EMAIL / JIRA_TOKEN).
 */

const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');

/* --------------------------------------------------------------- config --- */

function config() {
  const arq = path.join(RAIZ, 'config.json');
  const exemplo = path.join(RAIZ, 'config.example.json');
  const base = fs.existsSync(arq) ? arq : exemplo;
  let rawData = fs.readFileSync(base, 'utf8');
  if (rawData.charCodeAt(0) === 0xFEFF) rawData = rawData.slice(1);
  const cfg = JSON.parse(rawData);

  cfg.email = process.env.JIRA_EMAIL || cfg.jira?.email || '';
  cfg.token = process.env.JIRA_TOKEN || cfg.jira?.token || '';

  if (!cfg.token) {
    console.error(
      '\nJIRA_TOKEN nao esta definido.\n\n' +
      'Opcao 1 - Variavel de ambiente:\n' +
      '    setx JIRA_TOKEN "cole-o-token-aqui"\n' +
      '    setx JIRA_EMAIL "seu.email@cvccorp.com.br"\n\n' +
      'Opcao 2 - Arquivo config.json (ja existente)\n' +
      'O token nao deve entrar em arquivo versionado do repositorio.\n'
    );
    process.exit(1);
  }
  if (!cfg.email) {
    console.error('JIRA_EMAIL nao esta definido.');
    process.exit(1);
  }
  return cfg;
}

/**
 * Preguicoso de proposito: quem so faz `require('./jira')` — o verify.js, por
 * exemplo, que trabalha em cima de data/ e nunca abre conexao — nao deve ser
 * obrigado a ter token. A credencial e cobrada na primeira chamada de verdade.
 */
let _cfg = null;
function cfg() { return (_cfg = _cfg || config()); }

let _auth = null;
function auth() {
  if (!_auth) {
    const c = cfg();
    _auth = 'Basic ' + Buffer.from(c.email + ':' + c.token).toString('base64');
  }
  return _auth;
}

function base() {
  return (cfg().baseUrl || 'https://cvccorp.atlassian.net').replace(/\/+$/, '');
}

/* ------------------------------------------------------------- transporte -- */

const log = (...a) => { if (!process.env.SDPREJ_QUIETO) console.error(...a); };
const dorme = ms => new Promise(r => setTimeout(r, ms));

/**
 * Uma chamada, com retentativa em 429 e 5xx.
 * O Jira manda Retry-After em 429; respeitamos.
 */
async function chamada(metodo, caminho, corpo, tentativa = 0) {
  const opt = {
    method: metodo,
    headers: { Authorization: auth(), Accept: 'application/json' },
  };
  if (corpo !== undefined) {
    opt.body = JSON.stringify(corpo);
    opt.headers['Content-Type'] = 'application/json';
  }

  let r;
  try {
    r = await fetch(base() + caminho, opt);
  } catch (e) {
    if (tentativa < 4) {
      await dorme(1000 * 2 ** tentativa);
      return chamada(metodo, caminho, corpo, tentativa + 1);
    }
    throw new Error('rede indisponivel em ' + caminho + ': ' + e.message);
  }

  if (r.status === 429 || r.status >= 500) {
    if (tentativa < 5) {
      const espera = Number(r.headers.get('retry-after')) * 1000 || 1000 * 2 ** tentativa;
      log(`  HTTP ${r.status} em ${caminho} — nova tentativa em ${espera / 1000}s`);
      await dorme(espera);
      return chamada(metodo, caminho, corpo, tentativa + 1);
    }
  }

  const txt = await r.text();
  if (!r.ok) {
    let det = txt.slice(0, 400);
    try {
      const j = JSON.parse(txt);
      if (j.errorMessages?.length) det = j.errorMessages.join(' | ');
      else if (j.errors) det = JSON.stringify(j.errors);
    } catch { /* mantem o texto cru */ }
    if (r.status === 401 || r.status === 403) {
      det += '\n  (token invalido, expirado, ou sem permissao no projeto)';
    }
    throw new Error(`HTTP ${r.status} em ${caminho}: ${det}`);
  }
  return txt ? JSON.parse(txt) : null;
}

/* ----------------------------------------------------------------- busca --- */

/**
 * Busca paginada por JQL. Pagina com nextPageToken (a API nova nao usa
 * startAt). Devolve todas as issues.
 *
 * @param {string}   jql
 * @param {string[]} campos   ids de campo, ex ['key','summary','customfield_11059']
 * @param {object}   [opt]    {expand, rotulo, maxPorPagina}
 */
async function buscar(jql, campos, opt = {}) {
  const porPagina = opt.maxPorPagina || 100;
  const rotulo = opt.rotulo || 'busca';
  const issues = [];
  let token = null, pagina = 0;
  const t0 = Date.now();

  do {
    const corpo = { jql, fields: campos, maxResults: porPagina };
    if (token) corpo.nextPageToken = token;
    if (opt.expand) corpo.expand = opt.expand;

    const r = await chamada('POST', '/rest/api/3/search/jql', corpo);
    issues.push(...(r.issues || []));
    token = r.nextPageToken || null;
    pagina++;
    log(`  ${rotulo}: ${issues.length} issues (${pagina} chamada${pagina > 1 ? 's' : ''})`);
    if (pagina > 200) throw new Error('paginacao nao terminou — limite de seguranca');
  } while (token);

  log(`  ${rotulo}: concluido em ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  return issues;
}

/** Contagem aproximada, barata — serve para conferir o universo. */
async function contar(jql) {
  const r = await chamada('POST', '/rest/api/3/search/approximate-count', { jql });
  return r.count;
}

/** Metadados de um filtro salvo (usamos para registrar o JQL de verdade). */
async function filtro(id) {
  return chamada('GET', `/rest/api/3/filter/${id}`);
}

/**
 * Busca por lote de chaves. Usado para ler o status dos GDIS referenciados:
 * sao ~1200 chaves, que nao cabem num JQL so.
 */
async function porChaves(chaves, campos, opt = {}) {
  const lote = opt.lote || 80;
  const rotulo = opt.rotulo || 'chaves';
  const projeto = opt.projeto ? `${opt.projeto} AND ` : '';
  const fora = [];
  for (let i = 0; i < chaves.length; i += lote) {
    const parte = chaves.slice(i, i + lote);
    const jql = `${projeto}key in (${parte.map(k => `"${k}"`).join(',')})`;
    log(`  ${rotulo}: lote ${i / lote + 1} de ${Math.ceil(chaves.length / lote)}`);
    /* chave que nao existe mais faz o JQL inteiro falhar; nesse caso caimos
       para lotes menores para isolar a chave morta em vez de perder o lote */
    try {
      fora.push(...await buscar(jql, campos, { rotulo: rotulo + ' (lote)', maxPorPagina: lote }));
    } catch (e) {
      if (parte.length === 1) {
        log(`    chave inexistente, ignorada: ${parte[0]}`);
        continue;
      }
      log(`    lote falhou (${e.message.slice(0, 80)}) — subdividindo`);
      const meio = Math.ceil(parte.length / 2);
      fora.push(...await porChaves(parte.slice(0, meio), campos, { ...opt, lote: meio }));
      fora.push(...await porChaves(parte.slice(meio), campos, { ...opt, lote: meio }));
    }
  }
  return fora;
}

module.exports = { buscar, contar, filtro, porChaves, chamada, base, cfg };
