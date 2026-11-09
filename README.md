# SLA de prejuízo

Tela de **SLA de atendimento** dos chamados de prejuízo (projeto SDPREJ) do Jira da CVC. O entregável é
**um arquivo HTML único e autocontido**, que abre offline por cópia simples, sem servidor e sem dependência externa.
Este repositório guarda as peças; `build-sla.js` monta.

> **Este repositório guarda só o código.** Os dados extraídos (`data/`) e o HTML montado (`dist/`) trazem **nome de
> colaborador com métrica individual de produtividade (LGPD)**, valor de prejuízo, chaves de chamado e resumos com
> localizadores de reserva. Estão no `.gitignore` desde o primeiro commit: uma vez comitado, o dado fica no histórico do git
> para sempre, e apagar o arquivo depois **não resolve**. **Não publique o HTML completo (`dist/`) em GitHub Pages** — no plano
> gratuito o site é sempre público. O que pode ir ao Pages é só a **versão anonimizada** em `docs/` (veja “Publicar no GitHub Pages”).
> Para mostrar a versão completa a alguém, envie o arquivo (veja “Enviar a tela”).

## As telas

| Aba | Responde |
|---|---|
| **Tempo de atuação** | quanto tempo alguém **trabalhou** em cada prejuízo (estimativa), por analista, tema e mês |
| **Tratativa (tempo corrido)** | quanto tempo o chamado levou da entrada na análise até o analista entregá-lo, **incluindo a espera na fila** |
| **Capacidade por dia** | quantos chamados a TI entrega por dia, quantos chegam, e quando a fila zera nesse ritmo |
| **Ciclo do chamado** | dias entre a abertura e o encerramento do chamado inteiro |

## Como rodar

Precisa de **Node 18 ou mais novo** e nada mais — zero dependências, nenhum `npm install`.

```
setx JIRA_EMAIL "seu.email@cvccorp.com.br"
setx JIRA_TOKEN "cole-o-token-aqui"        (abra um terminal novo depois do setx)

run-sla.cmd                  extrai do Jira e monta dist\SLA_Painel.html   (~3 min: lê o histórico de todos os chamados)
node extract/sla.js          só extrai       -> data/sla.json
node build-sla.js            só monta        -> dist/SLA_Painel.html
node build-sla.js --envio    versão para mandar a outra pessoa -> dist/SLA_Prejuizo_AAAA-MM-DD.html
node build-sla.js --publico  versão ANONIMIZADA para o GitHub Pages -> docs/index.html
node verify.js               confere o payload (não fala com o Jira)
```

O token é gerado em <https://id.atlassian.com/manage-profile/security/api-tokens> e **nunca** entra em arquivo do repositório.

## Enviar a tela

`node build-sla.js --envio` gera o arquivo datado, sem o link “Painel de prejuízo” (que aponta para um arquivo que quem recebe não tem).
Mande por Teams, e-mail ou OneDrive. **HTML em SharePoint/Teams é baixado, não renderizado** (a biblioteca de documentos desativa script):
quem recebe baixa e abre local.

## Publicar no GitHub Pages (versão anonimizada)

`node build-sla.js --publico` monta `docs/index.html` a partir de `data/sla.json` trocando o que identifica:
analistas viram “Analista NN”, chaves viram “CH-n” (sem link para o Jira), resumos são omitidos, valores em R$ não aparecem
e a JQL é omitida. Ficam só métricas agregadas (contagens, datas, tempos, tema/produto/natureza/área/status).
O build **aborta (código 3)** se, depois de montado, ainda achar nome de analista, `SDPREJ-`, domínio do Jira, e-mail corporativo ou JQL no HTML.

Primeira vez: no GitHub, **Settings → Pages → Build and deployment → Deploy from a branch → `main` / `/docs`**
(se o deploy inicial usou `/ (root)`, ele publica o README; trocar para `/docs` corrige). A cada atualização:

```
run-sla.cmd                  (ou node extract/sla.js) atualiza os dados
node build-sla.js --publico
git add docs && git commit -m "docs: atualiza painel publico" && git push
```

Só `docs/` é versionado; `data/` e `dist/` continuam no `.gitignore`. **Limite conhecido:** o código “Analista NN” esconde o nome, mas é
produtividade individual pseudonimizada (LGPD segue valendo) — em time pequeno, quem conhece os volumes pode reconhecer a pessoa.
Se isso for um problema, o próximo passo é ocultar o quadro por analista na versão pública.

## Como o SLA é medido

- **Não há SLA oficial no Jira para prejuízo.** Os campos de SLA de prejuízo existem, mas estão vazios em todos os chamados, e o Service Desk
  não devolve SLA para eles. Por isso o SLA é **calculado**, e a **meta é um parâmetro da tela**, não um dado do Jira.
- **Tratativa** = da entrada do chamado na etapa `análise área responsável` (criação, ou a volta da conferência) até o analista movê-lo para
  `Conferência supervisão/gerência`, atribuída a **quem moveu**. Depois disso o prazo deixa de ser da TI. Cada passagem é uma tratativa;
  o chamado que volta da conferência gera outra (um *retorno*).
- **Tempo corrido ≠ tempo de atuação.** O tempo corrido inclui toda a espera: um chamado pode esperar meses e ser tratado em minutos.
  O Jira não registra esforço, então a atuação é **estimada por dois sinais**:
  - **ritmo entre ações** — minutos desde a ação anterior do mesmo analista em *outro* chamado (um “salvar” de formulário, uma mudança de etapa
    ou um comentário), se for a mesma sessão de trabalho (até 30 min). É um limite superior do esforço naquele chamado, mas **não enxerga entregas
    isoladas** (quem investigou muito tempo sem outra ação no Jira fica sem medida), então a mediana tende a **subestimar**;
  - **horas apontadas** — lançamentos de horas do Tempo dentro da passagem. Só existem desde que o apontamento virou obrigatório, vêm em blocos
    de 15 min e incluem trabalho fora do Jira, então tendem a **superestimar**. A autoria do lançamento aparece como o aplicativo, não como a
    pessoa: é atribuída a quem entregou.

  As duas fontes discordam, e **a realidade deve ficar entre elas** — por isso a tela deixa escolher a fonte em vez de esconder isso numa média.
  Uma entrega sem sinal fica **sem estimativa**, nunca com um valor inventado. Entrega em lote (outra ação do analista no mesmo minuto) não mede esforço.
- **Capacidade por dia** é o **ritmo observado** numa janela, não um limite medido: não desconta feriados, férias nem entregas em lote. A previsão
  de “fila zera em” supõe que entradas e saídas se mantêm, e muda muito com a janela escolhida.
- **Mediana** pelo elemento central superior (em lista par, `v[n/2]`), de modo que o valor exibido é sempre um valor que existe.

## Estrutura

```
src/sla.template.html  cabeçalho + marcação das 4 abas + marcadores @@...@@
src/sla.js             cálculo e render, no navegador (a meta é editável, então nada vem pré-calculado)
src/shared.js          gráficos (barras, rosca, área), menu lateral recolhível, KPIs animados
src/app.css            estilo (paleta CVC/Trend, tema claro e escuro)
src/assets/            logo da CVC (PNG transparente, embutido em base64 no HTML)
extract/jira.js        transporte: auth, paginação, retentativa em 429/5xx
extract/historico.js   completa o histórico dos chamados com mais de 100 mudanças
extract/tratativa.js   passagens pela análise e estimativas de atuação (regra pura, sem I/O)
extract/derive.js      tema, produto e natureza derivados do resumo do chamado
extract/aggregate.js   agrupamento e números (mediana, soma em centavos)
extract/sla.js         monta o payload       -> data/sla.json
build-sla.js           junta tudo            -> dist/SLA_Painel.html
verify.js              confere o payload em data/
```

## Origem

Extraído do painel de prejuízo SDPREJ (repositório `sdprej-trend`), do qual compartilha as regras de derivação. Os arquivos
`extract/jira.js`, `extract/derive.js` e `extract/aggregate.js` são **cópias**: uma correção feita num dos repositórios precisa ser levada ao outro.

## Defeitos conhecidos no dado (não no código)

- **Autor do apontamento de horas** não identifica a pessoa (aparece como o aplicativo de apontamento).
- **Comentários** vêm limitados pelo Jira na busca; chamado com muitos comentários pode ter atividade a menos.
- **Tema e produto** são inferidos do resumo do chamado (não existem como campo); chamados antigos têm mais “não identificado”.


Implementar visualização aprimorada