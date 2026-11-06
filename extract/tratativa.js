'use strict';
/**
 * tratativa.js — as passagens de um chamado pela etapa de ANALISE (a parte da TI)
 * e as estimativas de TEMPO DE ATUACAO em cada uma.
 *
 * O fluxo do SDPREJ: o chamado nasce em "analise area responsavel"; o analista
 * da TI conclui movendo-o para "Conferencia supervisao/gerencia" (em 127 de 127
 * saidas observadas o destino foi esse). Dali em diante — aprovacao da diretoria,
 * qualidade, encerramento — o prazo nao e mais da TI. Por isso o tempo de
 * TRATATIVA e: da entrada na analise ate a entrega, atribuido a quem entregou.
 *
 * Um chamado pode passar mais de uma vez pela analise (volta da conferencia).
 * Cada passagem e um registro; n=1 e a primeira, n>1 sao retornos.
 *
 * TEMPO CORRIDO x TEMPO DE ATUACAO. O tempo corrido (entrada -> entrega) inclui toda
 * a espera na fila: um chamado pode esperar meses e ser tratado em minutos. O Jira nao
 * registra quanto alguem trabalhou nele, entao a atuacao e ESTIMADA por dois sinais:
 *   - apontado: horas lancadas no Jira (Tempo) dentro da janela da passagem — declarado;
 *     so existe desde ago/2026, quando o apontamento virou obrigatorio.
 *   - ritmo: tempo entre a acao anterior do analista (em outro chamado) e a entrega,
 *     quando e a mesma sessao de trabalho (intervalo <= IDLE_MIN). Limite superior: o
 *     analista pode ter feito outra coisa no intervalo.
 * Entregas isoladas (sem acao vizinha) nao tem ritmo: ficam sem medida, nao com chute.
 *
 * JavaScript puro, sem I/O: recebe o chamado com o changelog embutido.
 */

const ETAPA = 'análise área responsável';

/** ociosidade maxima entre duas acoes seguidas do mesmo analista para valerem como uma sessao */
const IDLE_MIN = 30;

const minEntre = (a, b) => Math.max(0, Math.round((a - b) / 60000));
const minuto = ms => Math.floor(ms / 60000);

/**
 * @param {object} it      chamado do Jira com expand=changelog (e, se houver, fields.worklog)
 * @param {number} agora   instante da extracao (ms) — fecha a passagem em curso
 * @returns {{ini:string,fim:string,min:number,quem:string|null,n:number,
 *            tIni:number,tFim:number|null,ap:number}[]}
 *   ini/fim em ISO como o Jira devolve ('' em fim = ainda na analise); min em minutos corridos;
 *   tIni/tFim em minutos desde a epoca; ap = minutos apontados na passagem (-1 = nada apontado)
 */
function passagens(it, agora) {
  const f = it.fields;

  const trans = [];
  const hist = (it.changelog?.histories || [])
    .slice().sort((a, b) => Date.parse(a.created) - Date.parse(b.created));
  for (const h of hist) {
    for (const item of h.items || []) {
      if ((item.fieldId || item.field) !== 'status') continue;
      /* auto-transicao (volta ao mesmo status) nao e mudanca de etapa — ver analistas.js */
      if (item.fromString === item.toString) continue;
      trans.push({ de: item.fromString, para: item.toString, quem: h.author?.displayName || '(sem autor)',
                   iso: h.created, em: Date.parse(h.created) });
    }
  }

  /* o status ao criar e a ORIGEM da primeira transicao; sem transicao, e o status de hoje */
  const inicial = trans.length ? trans[0].de : (f.status?.name || '');
  let n = 0;
  let aberta = null;
  if (inicial === ETAPA) { n = 1; aberta = { iso: f.created, em: Date.parse(f.created), n }; }

  const out = [];
  for (const t of trans) {
    if (t.de === ETAPA && aberta) {
      out.push({ ini: aberta.iso, fim: t.iso, min: minEntre(t.em, aberta.em), quem: t.quem, n: aberta.n,
                 tIni: minuto(aberta.em), tFim: minuto(t.em), ap: -1 });
      aberta = null;
    }
    if (t.para === ETAPA) { n++; aberta = { iso: t.iso, em: t.em, n }; }
  }
  /* ainda na analise: a passagem esta em curso, medida ate a extracao */
  if (aberta) out.push({ ini: aberta.iso, fim: '', min: minEntre(agora, aberta.em), quem: null, n: aberta.n,
                         tIni: minuto(aberta.em), tFim: null, ap: -1 });

  /* horas apontadas: o lancamento pertence a passagem em cujo intervalo ele COMECOU (1 h de folga
     antes da entrada); se comecou depois da entrega, vale ate 24 h depois — apontar no dia seguinte. */
  for (const w of f.worklog?.worklogs || []) {
    const s = Date.parse(w.started);
    const seg = Number(w.timeSpentSeconds) || 0;
    if (!Number.isFinite(s) || seg <= 0) continue;
    const dentro = out.find(p => s >= p.tIni * 60000 - 3600e3 && (p.tFim == null || s <= p.tFim * 60000));
    const depois = out.find(p => p.tFim != null && s > p.tFim * 60000 && s <= p.tFim * 60000 + 24 * 3600e3);
    const alvo = dentro || depois;
    if (alvo) alvo.ap = (alvo.ap < 0 ? 0 : alvo.ap) + Math.round(seg / 60);
  }
  return out;
}

/**
 * Acoes de cada pessoa no chamado, em minutos desde a epoca: uma por entrada do historico
 * (cada "salvar" de formulario ou mudanca de etapa) e uma por comentario.
 * @returns {{q:string,t:number}[]}
 */
function acoes(it) {
  const out = [];
  for (const h of it.changelog?.histories || []) {
    out.push({ q: h.author?.displayName || '(sem autor)', t: minuto(Date.parse(h.created)) });
  }
  for (const c of it.fields?.comment?.comments || []) {
    if (c.author?.displayName) out.push({ q: c.author.displayName, t: minuto(Date.parse(c.created)) });
  }
  return out;
}

/**
 * Estima o tempo de atuacao (ritmo) de uma entrega.
 *
 * @param {{t:number,k:number}[]} linha  acoes do analista em TODOS os chamados, ordenadas por t
 * @param {number} k     indice do chamado desta entrega
 * @param {number} tFim  minuto da entrega
 * @param {number} tIni  minuto da entrada na analise
 * @param {number} idle  ociosidade maxima, em minutos
 * @returns {{ra:number, lo:number}}  ra = minutos (-1 = isolada, sem medida); lo = 1 se houve outra
 *   acao dele no mesmo minuto (entrega em lote: o intervalo nao mede esforco)
 */
function ritmo(linha, k, tFim, tIni, idle = IDLE_MIN) {
  /* ultima posicao com t <= tFim (busca binaria) */
  let lo = 0, hi = linha.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (linha[m].t <= tFim) lo = m + 1; else hi = m; }
  let i = lo - 1;

  let vizinha = null;                      /* acao anterior em OUTRO chamado */
  let propria = null;                      /* primeira acao dele NESTE chamado, dentro da passagem */
  let lote = 0;
  for (; i >= 0; i--) {
    const e = linha[i];
    if (tFim - e.t > idle) break;                                  /* alem da sessao: nada mais conta */
    if (e.k === k) { if (e.t >= tIni && e.t < tFim) propria = e.t; continue; }   /* andando para tras: fica a mais antiga */
    vizinha = e; break;                                            /* so valem as acoes depois dela */
  }
  if (vizinha && vizinha.t === tFim) lote = 1;

  const cand = [];
  if (vizinha && tFim - vizinha.t <= idle) cand.push(tFim - vizinha.t);
  if (propria != null && tFim - propria <= idle) cand.push(tFim - propria);
  return { ra: cand.length ? Math.max(...cand) : -1, lo: lote };
}

module.exports = { passagens, acoes, ritmo, ETAPA, IDLE_MIN };
