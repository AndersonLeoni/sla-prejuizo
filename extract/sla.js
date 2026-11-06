#!/usr/bin/env node
/**
 * sla.js — extrai o payload da tela de SLA do ciclo para data/sla.json.
 *
 *   node extract/sla.js
 *
 * Universo: TODOS os chamados de prejuizo do projeto, em aberto E encerrados,
 * de todo o periodo (nenhum corte de data nem de status).
 *
 * Por que o SLA e CALCULADO e nao lido do Jira: os campos "SLA PREJ COMERCIAL",
 * "SLA PREJ POS-TRAVEL", "Time to resolution" e "Time to first response" existem
 * no Jira mas estao vazios em 100% dos chamados deste universo, e o Service Desk
 * nao devolve SLA para eles. O que existe de confiavel e a data de abertura e
 * a data de resolucao (resolutiondate), presente em todos os encerrados. A meta
 * (em dias) e parametro da tela, nao dado do Jira.
 *
 * Payload: dicionarios (temas, produtos, naturezas, areas, status) + rows, uma
 * linha por chamado, com chaves curtas:
 *   k chave | m resumo | c criado (YYYY-MM-DD) | r resolvido ('' se aberto)
 *   d 1 = encerrado (categoria "done") | s status (idx) | t tema (idx)
 *   p produto (idx) | n natureza tecnico/nao-tecnico (idx) | a area (idx) | v valor R$
 *
 * Alem disso, `trat` guarda as PASSAGENS pela etapa de analise (a parte da TI),
 * lidas do historico de status — ver extract/tratativa.js:
 *   t linha em rows (idx) | a analista que entregou (idx em `analistas`, -1 = ainda na analise)
 *   i entrada (YYYY-MM-DD) | f entrega (YYYY-MM-DD, '' = em curso) | m minutos corridos
 *   n numero da passagem (1 = primeira, >1 = retorno da conferencia)
 *   ap minutos apontados no Jira dentro da passagem (-1 = nada apontado; so desde ago/2026)
 *   ra minutos desde a acao anterior do analista, na mesma sessao (-1 = entrega isolada)
 *   lo 1 = entrega em lote (outra acao dele no mesmo minuto)
 * ap e ra sao os dois sinais de TEMPO DE ATUACAO (o tempo corrido m inclui a espera na fila).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const jira = require('./jira');
const D = require('./derive');
const A = require('./aggregate');
const { passagens, acoes, ritmo, IDLE_MIN } = require('./tratativa');
const { completarTruncados } = require('./historico');

const RAIZ = path.join(__dirname, '..');

/* O universo: todos os chamados de prejuizo (em aberto E encerrados) do projeto SDPREJ, dos tres
   departamentos responsaveis de TI/fraude. Sem corte de status nem de data. */
const JQL_BASE =
  'project = 10236 AND issuetype = "Prejuízo / não conformidade" AND ' +
  '"Departamento responsável (migrated)[Dropdown]" in ("Fraude Prejuízo", "TI - prejuízo", "CVC - TI - Prejuízo")';

const CAMPOS = [
  'key', 'summary', 'created', 'resolutiondate', 'status',
  D.CAMPO.valorFinal, D.CAMPO.valorInicial, D.CAMPO.areaFalha,
  'worklog', 'comment',          /* horas apontadas e comentarios: sinais de tempo de atuacao */
];

async function montar(agora = new Date()) {
  const jql = `${JQL_BASE} ORDER BY created ASC`;
  console.error('Universo: ' + jql);
  /* com o historico embutido: cada chamado traz o changelog inteiro, entao a pagina e menor
     (mesmo motivo de analistas.js) e os que passam de 100 mudancas sao completados depois */
  const issues = await jira.buscar(jql, CAMPOS, { rotulo: 'sla', expand: 'changelog', maxPorPagina: 50 });
  await completarTruncados(issues);

  const dic = { temas: [], produtos: [], naturezas: [], areas: [], status: [], analistas: [] };
  const idx = (lista, v) => {
    const s = v == null || v === '' ? '(vazio)' : v;
    let i = lista.indexOf(s);
    if (i < 0) { i = lista.length; lista.push(s); }
    return i;
  };

  const rows = issues.map(it => {
    const f = it.fields;
    const tema = D.tema(f.summary);
    return {
      k: it.key,
      m: f.summary || '',
      c: D.soData(f.created),
      r: f.resolutiondate ? D.soData(f.resolutiondate) : '',
      d: f.status?.statusCategory?.key === 'done' ? 1 : 0,
      s: idx(dic.status, D.valorDe(f.status)),
      t: idx(dic.temas, tema),
      p: idx(dic.produtos, D.produto(f.summary)),
      n: idx(dic.naturezas, D.classificaTemaTipo(tema)),
      a: idx(dic.areas, D.valorDe(f[D.CAMPO.areaFalha])),
      v: A.arredonda(D.valor(f)),
    };
  });

  /* linha do tempo de cada pessoa em TODOS os chamados (acoes = entradas do historico + comentarios):
     e dela que sai o "ritmo" — tempo desde a acao anterior do mesmo analista, na mesma sessao */
  const linhaDe = new Map();
  issues.forEach((it, k) => {
    for (const a of acoes(it)) {
      let l = linhaDe.get(a.q);
      if (!l) { l = []; linhaDe.set(a.q, l); }
      l.push({ t: a.t, k });
    }
  });
  linhaDe.forEach(l => l.sort((a, b) => a.t - b.t));

  /* passagens pela analise: o changelog fica de fora do payload, so o resultado vai */
  const trat = [];
  issues.forEach((it, linha) => {
    for (const p of passagens(it, agora.getTime())) {
      const r = p.quem == null ? { ra: -1, lo: 0 } : ritmo(linhaDe.get(p.quem) || [], linha, p.tFim, p.tIni);
      trat.push({
        t: linha,
        a: p.quem == null ? -1 : idx(dic.analistas, p.quem),
        i: D.soData(p.ini),
        f: p.fim ? D.soData(p.fim) : '',
        m: p.min,
        n: p.n,
        ap: p.ap,       /* minutos apontados no Jira dentro da passagem (-1 = nada apontado) */
        ra: r.ra,       /* minutos desde a acao anterior do analista, mesma sessao (-1 = entrega isolada) */
        lo: r.lo,       /* 1 = outra acao dele no mesmo minuto (entrega em lote) */
      });
    }
  });

  const z = n => String(n).padStart(2, '0');
  const hoje = `${agora.getFullYear()}-${z(agora.getMonth() + 1)}-${z(agora.getDate())}`;
  return { geradoEm: D.carimbo(agora), hoje, jql, idle: IDLE_MIN, ...dic, rows, trat };
}

if (require.main === module) {
  montar().then(p => {
    const txt = JSON.stringify(p);
    JSON.parse(txt);
    fs.mkdirSync(path.join(RAIZ, 'data'), { recursive: true });
    const destino = path.join(RAIZ, 'data', 'sla.json');
    fs.writeFileSync(destino + '.parcial', txt, 'utf8');
    fs.renameSync(destino + '.parcial', destino);
    const enc = p.rows.filter(r => r.d).length;
    console.error(`gravado data/sla.json  ${(Buffer.byteLength(txt) / 1024).toFixed(0)} KB  ` +
      `${p.rows.length} chamados (${enc} encerrados, ${p.rows.length - enc} em aberto) | ` +
      `${p.trat.length} passagens pela analise, ${p.analistas.length} analistas`);
  }).catch(e => { console.error('\nFALHOU: ' + e.message); process.exit(1); });
}

module.exports = { montar };
