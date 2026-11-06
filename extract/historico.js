'use strict';
/**
 * historico.js — completa o historico (changelog) dos chamados que passam de 100 mudancas.
 *
 * O changelog embutido na busca vem cortado em 100 entradas por chamado. Chamado com
 * historico maior perderia transicoes — e justamente o chamado que mais andou, o mais
 * interessante. Para esses, busca o historico completo no endpoint dedicado.
 */

const jira = require('./jira');

async function completarTruncados(issues) {
  const truncados = issues.filter(it => {
    const c = it.changelog;
    return c && typeof c.total === 'number' && c.total > (c.histories?.length || 0);
  });
  if (!truncados.length) return;

  console.error(`  historico: ${truncados.length} chamado(s) com mais de 100 mudancas — buscando completo`);
  for (const it of truncados) {
    const todas = [];
    let inicio = 0, total = 1;
    while (inicio < total) {
      const r = await jira.chamada('GET', `/rest/api/3/issue/${it.key}/changelog?startAt=${inicio}&maxResults=100`);
      todas.push(...(r.values || []));
      total = r.total ?? todas.length;
      inicio += r.maxResults || 100;
      if (inicio > 5000) break;   // guarda contra historico absurdo
    }
    it.changelog.histories = todas;
  }
}

module.exports = { completarTruncados };
