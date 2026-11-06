'use strict';
/**
 * derive.js — as regras de derivacao.
 *
 * Isto e o miolo analitico do painel: nenhuma destas classificacoes existe
 * como campo no Jira, todas sao inferidas. Mudar uma regra aqui muda numero
 * em toda visao, entao cada uma esta comentada com o porque.
 *
 * Este arquivo e JavaScript puro, sem dependencia e sem I/O, de proposito:
 * e o mesmo codigo que roda num resolver do Forge se o app for adiante.
 */

/* ------------------------------------------------------- IDs de campo ----- */

const CAMPO = {
  problema:    'customfield_10999',
  falha:       'customfield_11009',
  valorFinal:  'customfield_11059',  // Prejuizo apos Reversao
  valorInicial:'customfield_11048',  // Prejuizo inicial (fallback)
  fornecedor:  'customfield_11035',
  cliente:     'customfield_10969',
  areaFalha:   'customfield_11054',  // Area identificadora (objeto com .value)
  departamento:'customfield_10885',
  ocorrencia:  'customfield_10973',  // n de ocorrencia — texto LIVRE
};

/* ------------------------------------------------------------- tema ------- */

/**
 * Conjunto canonico de temas. UM lugar so.
 *
 * As duas extracoes antigas divergiam nos rotulos ("Divergencia de valor" vs
 * "Divergencia de informacoes", "GED / Portal" vs "Portal / GED"), o que fazia
 * a visao por tema e a visao de GDIS nomearem o mesmo tema de dois jeitos.
 * Aqui fica resolvido.
 */
const TEMA = {
  ORFA:        'Reserva Orfa (nao integrada)',
  REACOMODA:   'Reacomodacao / Realocacao',
  REMARCA:     'Remarcacao',
  FRAUDE:      'Fraude',
  CANCELA:     'Cancelamento sem integracao',
  DIVERG:      'Divergencia de valor',
  DUPLIC:      'Duplicidade',
  GED:         'GED / Portal',
  NOSHOW:      'No-show / Overbooking',
  REEMBOLSO:   'Reembolso',
  OMNIBEES:    'Integracao Omnibees/Trend (RES)',
  TREND:       'Reserva Trend (4000...)',
  SIG:         'Reserva SIG (211...)',
  GDS:         'Localizador GDS/Aereo',
  OUTROS:      'Outros / Nao classificado',
};

/**
 * Maiusculas e sem acento — as regras sao escritas sobre esta forma.
 * NFD separa a letra do acento, e \p{M} remove as marcas combinantes. Assim
 * "ÓRFÃ" e "ORFA" caem na mesma regra, e o fonte segue 100% ASCII.
 */
const normaliza = s =>
  String(s == null ? '' : s)
    .toUpperCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');

/**
 * A ORDEM IMPORTA: a primeira regra que casa vence. As palavras-chave vem
 * antes dos padroes numericos, porque um resumo com "REMARCACAO ... RES123456-1"
 * e um caso de remarcacao, nao de integracao.
 */
const REGRAS_TEMA = [
  [/ORFA/,                    TEMA.ORFA],
  [/REACOMODA|REALOCA/,       TEMA.REACOMODA],
  [/REMARCA/,                 TEMA.REMARCA],
  [/FRAUDE/,                  TEMA.FRAUDE],
  /* CANCELA, nao CANCELAD: pega "cancelamento" tambem. A extracao antiga exigia
     o D e perdia "RES000000-0000_Cancelamento em massa da Omnibees", que caia em
     integracao por causa do RES no meio do texto. */
  [/CANCELA|SEM INTEGRA/,     TEMA.CANCELA],
  [/DIVERG/,                  TEMA.DIVERG],
  [/DUPLIC/,                  TEMA.DUPLIC],
  [/GED|PORTAL/,              TEMA.GED],
  [/NO.?SHOW|OVERBOOK/,       TEMA.NOSHOW],
  [/REEMBOLS/,                TEMA.REEMBOLSO],
  /* padroes de identificador de reserva, depois das palavras-chave */
  [/RES\d{6}-\d+/,            TEMA.OMNIBEES],
  [/^4000\d{6}/,              TEMA.TREND],
  [/211\d{7}/,                TEMA.SIG],
  [/^[A-Z0-9]{6}\s*[-/]/,     TEMA.GDS],
];

function tema(resumo) {
  const s = normaliza(resumo);
  for (const [re, rotulo] of REGRAS_TEMA) if (re.test(s)) return rotulo;
  return TEMA.OUTROS;
}

/* ---------------------------------------------------------- produto ------- */

/**
 * Tipo de produto (aereo, ingresso, hospedagem...). Nao existe campo no Jira
 * para isto — e inferencia sobre o resumo, no mesmo espirito de tema(): a
 * palavra-chave explicita vence antes do padrao de localizador, porque um
 * resumo "INGRESSO DISNEY ORLANDO - LOC 4958486" tem "LOC" (que por si so
 * sugeriria hospedagem), mas a palavra INGRESSO decide primeiro.
 *
 * O padrao de localizador so entra como desempate quando nao ha
 * palavra-chave: RES.../4000.../211... sao sistemas de reserva de hotel
 * (Omnibees/Trend/SIG), e um codigo de 6 letras/numeros no comeco do resumo
 * e tipicamente localizador GDS — PNR de aereo.
 */
const PRODUTO = {
  HOSPEDAGEM: 'Hospedagem',
  AEREO:      'Aéreo',
  INGRESSO:   'Ingresso / Atração',
  PACOTE:     'Pacote',
  CARRO:      'Locação de veículo',
  NAO_IDENT:  'Não identificado',
};

const REGRAS_PRODUTO = [
  [/INGRESSO|DISNEY|UNIVERSAL|PARQUE|ATRA[CÇ]AO|TICKET/, PRODUTO.INGRESSO],
  [/\bAEREO\b|\bVOO\b|PASSAGEM AEREA|\bLATAM\b|\bGOL\b|\bAZUL\b|\bTAP\b/, PRODUTO.AEREO],
  [/PACOTE/,                                              PRODUTO.PACOTE],
  [/LOCADORA|ALUGUEL DE VEICULO|RENT.?A.?CAR|\bCARRO\b/,  PRODUTO.CARRO],
  [/HOTEL|HOSPEDAGEM|RESORT|POUSADA/,                     PRODUTO.HOSPEDAGEM],
  /* sem palavra-chave: desempata pelo padrao de localizador, igual a tema() */
  [/RES\d{6}-\d+/,            PRODUTO.HOSPEDAGEM],   // Omnibees
  [/^4000\d{6}/,              PRODUTO.HOSPEDAGEM],   // Trend
  [/211\d{7}/,                PRODUTO.HOSPEDAGEM],   // SIG
  [/^[A-Z0-9]{6}\s*[-/]/,     PRODUTO.AEREO],         // localizador GDS = PNR aereo
];

function produto(resumo) {
  const s = normaliza(resumo);
  for (const [re, rotulo] of REGRAS_PRODUTO) if (re.test(s)) return rotulo;
  return PRODUTO.NAO_IDENT;
}

/* ------------------------------------------------------------ aging ------- */

const FAIXAS = [
  [90,       '0-90 dias'],
  [180,     '91-180 dias'],
  [365,    '181-365 dias'],
  [540,    '366-540 dias'],
  [Infinity, '541+ dias'],
];

/** Ordem fixa, nao ordenada por contagem — e uma escala, nao um ranking. */
const FAIXAS_ORDEM = FAIXAS.map(f => f[1]);

function faixaAging(dias) {
  for (const [lim, rotulo] of FAIXAS) if (dias <= lim) return rotulo;
  return FAIXAS_ORDEM[FAIXAS_ORDEM.length - 1];
}

/* ------------------------------------------------------------ valor ------- */

/**
 * O prejuizo vale o valor APOS a reversao: parte do prejuizo inicial costuma
 * ser recuperada. Quando esse campo esta vazio, o inicial e a melhor estimativa.
 *
 * Os dois campos sao Decimal no Jira, entao chegam numericos no JSON. Nao
 * converter por texto: foi assim que os valores ja inflaram 100x uma vez,
 * porque "1855,23" em pt-BR virou 185523 num parse com cultura invariante.
 */
function valor(f) {
  const a = f[CAMPO.valorFinal], b = f[CAMPO.valorInicial];
  const n = typeof a === 'number' ? a : typeof b === 'number' ? b : 0;
  return Number.isFinite(n) ? n : 0;
}

/* -------------------------------------------------------- texto / datas --- */

/** Campo de lista do Jira chega como objeto {value: "..."} ou nulo. */
const valorDe = v =>
  v == null ? '' : typeof v === 'object' ? String(v.value ?? v.name ?? '') : String(v);

/**
 * "Pos Travel - prejuizo" -> "Pos Travel". Usado nas trocas de area.
 *
 * O `i` acentuado e obrigatorio no padrao. A versao anterior era
 * /preju i? [zs] o/i, que casa "prejuizo" e "prejuzo" mas NAO casa "prejuízo" —
 * e prejuízo com acento e como o Jira grava os 17 valores reais deste campo.
 * Resultado: a funcao existia e nunca removia nada. O sufixo aparecia no
 * grafico de trocas de area em todas as categorias.
 *
 * Aceita tambem as duas grafias de travessao, porque ha valor cadastrado com
 * "–" em vez de "-".
 */
const limpaArea = s =>
  String(s == null ? '' : s).replace(/\s*[-–]\s*preju[íi]?[zs]o\s*$/i, '').trim();

const DIA = 86400000;

/** Dias corridos desde a abertura, truncado. */
function diasAberto(criadoEm, ref = Date.now()) {
  const t = Date.parse(criadoEm);
  if (!Number.isFinite(t)) return 0;
  return Math.floor((ref - t) / DIA);
}

const soData = d => String(d || '').slice(0, 10);   // 2024-08-09T12:00:00-0300 -> 2024-08-09
const mes     = d => String(d || '').slice(0, 7);   // -> 2024-08

/**
 * "2026-09-22 12:06" — hora LOCAL, nao UTC.
 * E um carimbo para o usuario ler no cabecalho do painel, nao um timestamp de
 * maquina: "extraido as 12:06" tem de ser 12:06 no relogio de quem le.
 */
function carimbo(d) {
  const z = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())} ` +
         `${z(d.getHours())}:${z(d.getMinutes())}`;
}

/* -------------------------------------------------------------- GDIS ----- */

/**
 * O vinculo SDPREJ -> GDIS vem do campo "n de ocorrencia", que e TEXTO LIVRE:
 * aceita qualquer coisa. O campo nativo issuelinks do Jira esta vazio em todos
 * os 1.513 chamados, entao nao existe segunda fonte — o que esta nesse campo e
 * tudo o que ha. Por isso a bagunca e tratada como dado, nao como erro.
 */
const RE_GDIS = /^GDIS-\d+$/;
const RE_CHAVE_QUALQUER = /^[A-Z][A-Z0-9_]+-\d+$/;

/** Classifica o CONTEUDO do campo, antes de saber o status do GDIS. */
function classificaOcorrencia(bruto) {
  const s = String(bruto == null ? '' : bruto).trim();
  if (!s) return 'vaz';                          // campo em branco
  if (RE_GDIS.test(s)) return 'gdis';            // chave valida
  if (RE_CHAVE_QUALQUER.test(s)) return 'oth';   // chave de outro projeto
  return 'txt';                                  // texto livre, sem chave
}

/**
 * Status real do GDIS -> balde. Derivado do catalogo de verdade do Jira,
 * inclusive a inconsistencia de caixa ("Nivel 1" / "nivel 2" / "Nivel 3").
 *
 * "Aguardando Validacao do Usuario" fica num balde SO DELE de proposito:
 * o Jira classifica esse status como concluido, mas a bola esta com o
 * solicitante, nao com a TI — juntar com "concluido" esconderia trabalho
 * que ainda vai voltar.
 */
function baldeStatus(status) {
  const s = normaliza(status);
  if (!s) return 'nf';                                   // GDIS nao localizado
  if (/NIVEL\s*1/.test(s)) return 'n1';
  if (/NIVEL\s*2/.test(s)) return 'n2';
  if (/NIVEL\s*3/.test(s)) return 'n3';
  if (/AGUARDANDO VALIDACAO/.test(s)) return 'usr';
  if (/CANCELAD/.test(s)) return 'can';
  if (/FECHAD|RESOLVID|CONCLUID/.test(s)) return 'res';
  if (/ABERTO|PENDENTE|A CONCLUIR/.test(s)) return 'pen';
  return 'pen';                                          // status novo: trata como fila
}

/** Balde -> classe apresentada. Cinco classes, e so. */
const CLASSE = {
  pen: 'pen', n1: 'ana', n2: 'ana', n3: 'ana', usr: 'usr',
  res: 'fim', can: 'fim', des: 'fim',
  nf: 'sem', oth: 'sem', txt: 'sem', vaz: 'sem',
};

/* -------------------------------------------- tecnico vs nao-tecnico ----- */

/**
 * PROPOSTA de classificacao, validada com o dono do produto (Anderson) em
 * 2026 — nao e extraida de nenhum campo do Jira, e uma tabela de negocio
 * revisavel. Separa falha de SISTEMA/INTEGRACAO (o SDPREJ nasceu porque algo
 * nao conversou) de PROCESSO/DECISAO HUMANA (o sistema funcionou, alguem
 * decidiu, errou ou fraudou).
 *
 * Cancelamento sem integracao fica em AMBIGUO de proposito: o rotulo sugere
 * falha tecnica, mas o gatilho de origem pode ter sido uma decisao comercial
 * de cancelar — o proprio Anderson confirmou que isso exige analise caso a
 * caso, entao a regra nao forca nem tecnico nem nao-tecnico.
 */
const TIPO = {
  TECNICO:     'Falha técnica (sistema/integração)',
  NAO_TECNICO: 'Processo / decisão humana',
  AMBIGUO:     'Ambíguo (requer análise caso a caso)',
  OUTROS:      'Não classificado',
};

const TEMA_TIPO = {
  [TEMA.ORFA]:      TIPO.TECNICO,
  [TEMA.REACOMODA]: TIPO.NAO_TECNICO,
  [TEMA.REMARCA]:   TIPO.NAO_TECNICO,
  [TEMA.FRAUDE]:    TIPO.NAO_TECNICO,
  [TEMA.CANCELA]:   TIPO.AMBIGUO,
  [TEMA.DIVERG]:    TIPO.NAO_TECNICO,
  [TEMA.DUPLIC]:    TIPO.TECNICO,
  [TEMA.GED]:       TIPO.TECNICO,
  [TEMA.NOSHOW]:    TIPO.NAO_TECNICO,
  [TEMA.REEMBOLSO]: TIPO.NAO_TECNICO,
  [TEMA.OMNIBEES]:  TIPO.TECNICO,
  [TEMA.TREND]:     TIPO.TECNICO,
  [TEMA.SIG]:       TIPO.TECNICO,
  [TEMA.GDS]:       TIPO.TECNICO,
  [TEMA.OUTROS]:    TIPO.OUTROS,
};

const classificaTemaTipo = tema => TEMA_TIPO[tema] || TIPO.OUTROS;

module.exports = {
  CAMPO, TEMA, FAIXAS_ORDEM, CLASSE, PRODUTO, TIPO,
  normaliza, tema, faixaAging, valor, valorDe, limpaArea, produto,
  diasAberto, soData, mes, carimbo,
  classificaOcorrencia, baldeStatus, classificaTemaTipo,
};
