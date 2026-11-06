#!/usr/bin/env node
/**
 * verify.js — confere a integridade do payload data/sla.json.
 *
 * Nao fala com o Jira e nao precisa de token: le o dado que ja esta em disco e confere as
 * invariantes (todo encerrado tem data de resolucao, nenhuma passagem com tempo negativo,
 * passagens em curso = chamados hoje na etapa de analise, regras de tema/produto recalculadas...).
 *
 * Uso:  node verify.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const D = require('./extract/derive');

const ler = f => JSON.parse(fs.readFileSync(path.join(__dirname, 'data', f), 'utf8'));

let falhas = 0, avisos = 0;
const ok    = m => console.log('  ok    ' + m);
const falha = m => { falhas++; console.log('  FALHA ' + m); };
const aviso = m => { avisos++; console.log('  nota  ' + m); };

/* ------------------------------------------------------- tela de SLA ------ */

function verificaSla(SL) {
  console.log('\ntela de SLA (' + SL.rows.length + ' chamados, extraida em ' + SL.geradoEm + ')');
  const R = SL.rows;
  const enc = R.filter(r => r.d), abr = R.filter(r => !r.d);
  const dia = s => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / 864e5;

  /* o ciclo so existe se a data de resolucao existe: encerrado sem data nao tem SLA calculavel */
  const semData = enc.filter(r => !r.r).length, abertoComData = abr.filter(r => r.r).length;
  semData ? falha(semData + ' chamado(s) encerrado(s) sem data de resolucao') : ok('todo encerrado tem data de resolucao');
  abertoComData ? aviso(abertoComData + ' chamado(s) em aberto com data de resolucao preenchida') : ok('nenhum em aberto tem data de resolucao');
  const neg = enc.filter(r => r.r && dia(r.r) < dia(r.c)).length;
  neg ? falha(neg + ' chamado(s) resolvido(s) antes de criado') : ok('nenhum ciclo negativo');

  /* tema/produto/natureza sao derivados do resumo: recalcula e compara com o gravado */
  const difTema = R.filter(r => D.tema(r.m) !== SL.temas[r.t]).length;
  const difProd = R.filter(r => D.produto(r.m) !== SL.produtos[r.p]).length;
  const difNat = R.filter(r => D.classificaTemaTipo(SL.temas[r.t]) !== SL.naturezas[r.n]).length;
  difTema ? aviso('tema mudou em ' + difTema + ' chamados (regra editada desde a extracao)') : ok('tema recalcula identico nos ' + R.length + ' resumos');
  difProd ? aviso('produto mudou em ' + difProd + ' chamados (regra editada desde a extracao)') : ok('produto recalcula identico');
  difNat ? falha('natureza divergiu em ' + difNat + ' chamados') : ok('natureza recalcula identico');

  const dup = R.length - new Set(R.map(r => r.k)).size;
  dup ? falha(dup + ' chave(s) repetida(s)') : ok('nenhuma chave repetida');

  /* --- tratativa: passagens pela etapa de analise (extract/tratativa.js) --- */
  const T = SL.trat || [];
  if (!T.length) { aviso('payload sem passagens de tratativa (rode  node extract/sla.js  de novo)'); return; }
  const ETAPA = require('./extract/tratativa').ETAPA;
  const quebradas = T.filter(p => !(p.t >= 0 && p.t < R.length) || p.a >= SL.analistas.length).length;
  quebradas ? falha(quebradas + ' passagem(ns) com referencia invalida') : ok('todas as ' + T.length + ' passagens apontam para chamado e analista validos');
  const negT = T.filter(p => p.m < 0 || p.n < 1).length;
  negT ? falha(negT + ' passagem(ns) com minutos negativos ou numero invalido') : ok('nenhuma passagem com tempo negativo');
  const emCurso = T.filter(p => !p.f), entregues = T.filter(p => p.f);
  const semAutor = entregues.filter(p => p.a < 0).length;
  semAutor ? falha(semAutor + ' passagem(ns) entregue(s) sem analista') : ok('toda passagem entregue tem analista');
  /* a passagem em curso so existe para quem esta HOJE na analise — e todo mundo que esta na analise tem uma */
  const naAnalise = R.filter(r => SL.status[r.s] === ETAPA).length;
  const chamadosEmCurso = new Set(emCurso.map(p => p.t)).size;
  (chamadosEmCurso === naAnalise && emCurso.length === chamadosEmCurso)
    ? ok(chamadosEmCurso + ' passagens em curso = chamados hoje na etapa de analise')
    : falha('passagens em curso: ' + emCurso.length + ' (' + chamadosEmCurso + ' chamados) x ' + naAnalise + ' chamados na etapa de analise');
  const sem = R.length - new Set(T.map(p => p.t)).size;
  sem ? aviso(sem + ' chamado(s) nunca passaram pela etapa de analise (sem tratativa medida)') : ok('todo chamado passou pela etapa de analise');
  /* --- tempo de atuacao: horas apontadas (ap) e ritmo entre acoes (ra) --- */
  if (T.some(p => 'ap' in p)) {
    const IDLE = require('./extract/tratativa').IDLE_MIN;
    const badAp = T.filter(p => !(p.ap === -1 || p.ap > 0)).length;
    const badRa = T.filter(p => !(p.ra === -1 || (p.ra >= 0 && p.ra <= IDLE))).length;
    const badLo = T.filter(p => p.lo !== 0 && p.lo !== 1).length;
    (badAp || badRa || badLo)
      ? falha(`campos de atuacao invalidos: ap ${badAp}, ra ${badRa} (limite ${IDLE} min), lo ${badLo}`)
      : ok('ap, ra e lo dentro do dominio (ra <= ' + IDLE + ' min)');
    const abertaComRitmo = emCurso.filter(p => p.ra !== -1).length;
    abertaComRitmo ? falha(abertaComRitmo + ' passagem(ns) em curso com ritmo (so entrega tem ritmo)') : ok('passagens em curso nao tem ritmo');
    /* cobertura: desde ago/2026 o apontamento e obrigatorio; antes disso so o ritmo existe */
    const rec = entregues.filter(p => p.f >= '2026-08-01');
    const pc = (a, b) => b ? (a / b * 100).toFixed(1) + '%' : '0%';
    ok(`entregas desde 2026-08-01: ${rec.length} | com horas apontadas ${pc(rec.filter(p => p.ap > 0).length, rec.length)} | com ritmo ${pc(rec.filter(p => p.ra >= 0).length, rec.length)} | com algum dos dois ${pc(rec.filter(p => p.ap > 0 || p.ra >= 0).length, rec.length)}`);
    ok(`entregas antes de 2026-08-01: ${entregues.length - rec.length} | com horas apontadas ${pc(entregues.filter(p => p.f < '2026-08-01' && p.ap > 0).length, entregues.length - rec.length)} | com ritmo ${pc(entregues.filter(p => p.f < '2026-08-01' && p.ra >= 0).length, entregues.length - rec.length)}`);
    const antes = entregues.filter(p => p.f < '2026-08-01' && p.ap > 0).length;
    antes ? aviso(antes + ' entrega(s) anteriores a ago/2026 com horas apontadas') : ok('nenhuma hora apontada antes de ago/2026, como esperado');
  } else {
    aviso('payload sem campos de tempo de atuacao (rode  node extract/sla.js  de novo)');
  }
  const aut = SL.analistas.filter(n => /automation|jira|system|sistema/i.test(n));
  aut.length ? aviso('autor(es) que parecem automacao entregando analise: ' + aut.join(', ')) : ok('nenhum autor com cara de automacao entre os analistas');
  /* aberto + encerrado tem de fechar com o universo do painel; difere se o Jira andou entre as extracoes */
  ok(enc.length + ' encerrados + ' + abr.length + ' em aberto = ' + R.length);
}

function main() {
  if (!fs.existsSync(path.join(__dirname, 'data', 'sla.json'))) {
    console.error('Falta data/sla.json. Rode  node extract/sla.js  primeiro.');
    process.exit(1);
  }
  verificaSla(ler('sla.json'));
  console.log('\n' + (falhas ? falhas + ' FALHA(S)' : 'nenhuma falha') + (avisos ? ', ' + avisos + ' nota(s)' : ''));
  process.exit(falhas ? 1 : 0);
}

main();
