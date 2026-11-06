'use strict';
/**
 * aggregate.js — as agregacoes e os KPIs.
 *
 * As oito agregacoes de DT tem todas o mesmo formato {name,count,valor} e todas
 * somam exatamente o total de chamados. Isso nao e coincidencia: sao particoes
 * da mesma lista, produzidas por UMA funcao com parametros diferentes.
 */

/* --------------------------------------------------------------- groupBy --- */

/**
 * ARMADILHA que explica os rotulos do painel atual: o Group-Object do
 * PowerShell agrupa SEM diferenciar maiusculas de minusculas. Por isso
 * fornecedor tem 520 valores distintos byte a byte mas 514 grupos, e cliente
 * 359 contra 357. Se agrupassemos com distincao de caixa aqui, o rotulo
 * "Outros (502 categorias)" viraria "Outros (508 categorias)" e o painel
 * mudaria de numero sem nenhum chamado ter mudado.
 *
 * Mantemos a caixa-insensibilidade, e exibimos a primeira grafia encontrada.
 */
function groupBy(itens, chave, peso = () => 0) {
  const mapa = new Map();
  for (const it of itens) {
    const bruto = chave(it);
    const nome = bruto === '' || bruto == null ? '(vazio)' : String(bruto);
    const id = nome.toLocaleUpperCase('pt-BR');
    let g = mapa.get(id);
    if (!g) mapa.set(id, (g = { name: nome, count: 0, valor: 0 }));
    g.count++;
    g.valor += peso(it) || 0;
  }
  return [...mapa.values()];
}

/**
 * Ordem do ranking: contagem, depois valor, depois nome.
 *
 * O desempate importa mais do que parece. O painel antigo nao tinha nenhum: o
 * Sort-Object do Windows PowerShell 5.1 NAO e estavel, entao entre categorias
 * de contagem igual a ordem saia do quicksort do .NET — irreproduzivel. Isso
 * era invisivel num grafico, mas nao no corte do top-N: em fornecedor havia
 * cinco fornecedores empatados em 3 chamados disputando as ultimas vagas, e
 * quais dois entravam mudava o valor somado em "Outros" de uma execucao para
 * outra, sem que nenhum chamado tivesse mudado.
 *
 * Desempatar por valor decrescente e deterministico E mais util: com a mesma
 * contagem, quem custou mais caro e o que interessa ver.
 */
const porContagem = (a, b) =>
  b.count - a.count || b.valor - a.valor || a.name.localeCompare(b.name, 'pt-BR');

/**
 * Top-N com o resto colapsado.
 *
 * O rotulo do resto conta CATEGORIAS, nao chamados: "Outros (502 categorias)".
 * O bloco vai sempre no fim da lista, mesmo quando sua contagem e maior que a
 * do ultimo colocado — senao ele apareceria no meio do ranking e o leitor
 * entenderia como se fosse uma categoria real.
 */
function topN(grupos, limite) {
  const ord = grupos.slice().sort(porContagem);
  if (ord.length <= limite) return ord;

  const cabeca = ord.slice(0, limite);
  const resto = ord.slice(limite);
  const plural = resto.length === 1 ? 'categoria' : 'categorias';
  cabeca.push({
    name: `Outros (${resto.length} ${plural})`,
    count: resto.reduce((s, g) => s + g.count, 0),
    valor: arredonda(resto.reduce((s, g) => s + g.valor, 0)),
  });
  return cabeca;
}

/** Atalho: agrupa, arredonda e corta. E o que as oito agregacoes fazem. */
function agregar(itens, chave, peso, limite) {
  const g = groupBy(itens, chave, peso).map(x => ({ ...x, valor: arredonda(x.valor) }));
  return limite ? topN(g, limite) : g.sort(porContagem);
}

/**
 * Agrega respeitando uma ordem declarada em vez de ranking.
 * Serve para escala (faixas de aging) e para serie temporal (mensal), onde
 * ordenar por contagem destruiria a leitura. Categoria sem nenhum chamado
 * nao entra — mes vazio some do grafico em vez de virar barra zero.
 */
function agregarEmOrdem(itens, chave, peso, ordem) {
  const g = groupBy(itens, chave, peso);
  const porNome = new Map(g.map(x => [x.name, x]));
  const lista = ordem
    ? ordem.filter(n => porNome.has(n)).map(n => porNome.get(n))
    : g.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  return lista.map(x => ({ ...x, valor: arredonda(x.valor) }));
}

/* ------------------------------------------------------------ numeros ----- */

/** Centavos. Somar float acumula lixo (0.1+0.2); arredonda no fim de cada soma. */
const arredonda = n => Math.round((Number(n) || 0) * 100) / 100;

const soma = ns => arredonda(ns.reduce((s, n) => s + (Number(n) || 0), 0));

/**
 * Mediana pelo elemento central superior: em lista par, v[n/2], nao a media
 * dos dois centrais.
 *
 * E a convencao do painel de hoje (mediana de valor = 672; a media dos dois
 * centrais daria 668,33). Mantida de proposito para nao criar um degrau na
 * serie historica do KPI sem que nenhum chamado tenha mudado. A vantagem
 * lateral e que o valor exibido e sempre um prejuizo que existe de verdade
 * em algum chamado, e nao uma media sintetica.
 */
function mediana(ns) {
  if (!ns.length) return 0;
  const v = ns.map(n => Number(n) || 0).sort((a, b) => a - b);
  return arredonda(v[v.length >> 1]);
}

const maximo = ns => (ns.length ? arredonda(Math.max(...ns.map(n => Number(n) || 0))) : 0);

const media = ns => (ns.length ? arredonda(soma(ns) / ns.length) : 0);

/* ------------------------------------------------------- limites do painel - */

/**
 * Quantas categorias cada agregacao mostra antes de colapsar. Estes numeros
 * vem do painel de hoje — mudar um deles muda o rotulo "Outros (N categorias)"
 * e desalinha a comparacao com as extracoes anteriores.
 */
const LIMITE = {
  temas: 8,
  problema: 8,
  falha: 8,
  areaFalha: 8,
  fornecedor: 12,
  cliente: 12,
  produto: 8,
};

module.exports = {
  groupBy, topN, agregar, agregarEmOrdem,
  arredonda, soma, mediana, maximo, media,
  LIMITE,
};
