// Prévia da régua de e-mails: gera uma página HTML com cada modelo renderizado
// (computador e celular) para o Erick aprovar sem receber e-mails de teste.
//
//   node scripts/email-previa.ts --saida previa.html
//   node scripts/email-previa.ts --saida previa.html --simulacao amanha.json --dia 16/10
//
// `amanha.json` = linhas de public.email_regua_candidatos(<amanhã 10h>, true) com
// os dados ANONIMIZADOS (nomes trocados por marcadores; ver docs/marketing/emails-ciclo-vida.md).
// Os prints usam sempre a conta de exemplo, nunca dados de cliente.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TEMAS, escolher, montarRegua } from '../supabase/functions/email-ciclo-vida/regua.ts';
import type { Candidato, Dados } from '../supabase/functions/email-ciclo-vida/regua.ts';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
const saida = arg('--saida') || 'previa-emails.html';
const simulacao = arg('--simulacao');
const dia = arg('--dia') || '';

// Conta de exemplo dos prints (mesma dos tutoriais).
const EXEMPLO: Dados = {
  negocio: 'Doces da Ana', segmento: 'Confeitaria',
  insumos: 87, insumos_com_preco: 3, produtos: 2, produtos_com_preco: 1,
  produto_foco: { nome: 'Bolo de Chocolate 1kg', ingredientes: 9, ingredientes_sem_preco: 7, exemplos: ['Chocolate meio amargo', 'Creme de leite', 'Manteiga sem sal'] },
  insumos_recentes: ['Farinha de trigo', 'Açúcar', 'Ovos'],
  produtos_sem_preco: ['Cupcake'],
  ultimo_produto: { nome: 'Brigadeiro gourmet', preco: 2.5 },
  dias_sem_atualizar_precos: 42,
};
const ETAPA_NOME: Record<string, string> = {
  sem_perfil: 'Sem perfil', sem_ingrediente: 'Sem ingrediente', kit_sem_preco: 'Kit sem preço',
  sem_produto: 'Sem produto', produto_sem_preco: 'Produto sem preço', ativo: 'Ativo',
};
const FORMATO_NOME: Record<string, string> = {
  passo: 'Passo a passo', painel: 'Painel de números', tela: 'Tela anotada', carta: 'Carta', mito: 'Mito ou verdade', checklist: 'Checklist',
};

// A página do Artifact não carrega imagens de outros sites: logos viram data URI.
const ASSETS = join(RAIZ, '..', 'precificai-site', 'assets', 'email');
function embutirImagens(html: string): string {
  return html.replace(/https:\/\/precificaiapp\.com\/assets\/email\/([a-z0-9./-]+)/g, (url, arq) => {
    const p = join(ASSETS, arq);
    if (!existsSync(p)) return url;
    const tipo = arq.endsWith('.png') ? 'image/png' : 'image/jpeg';
    return `data:${tipo};base64,${readFileSync(p).toString('base64')}`;
  });
}
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function render(temaId: string, formato: string, estagio: string) {
  const tema = TEMAS.find((t) => t.id === temaId)!;
  const variante = tema.variantes.find((v) => v.formato === formato)!;
  return montarRegua({ tema, variante, campanha: `regua-${tema.id}` }, EXEMPLO, estagio as Candidato['estagio'], '#descadastro');
}

function cartao(temaId: string, formato: string, estagio: string, info: string): string {
  const tema = TEMAS.find((t) => t.id === temaId)!;
  const v = tema.variantes.find((x) => x.formato === formato)!;
  const m = render(temaId, formato, estagio);
  const doc = esc(embutirImagens(m.html));
  const previa = m.html.match(/mso-hide:all;">([^&]*)/)?.[1] || '';
  return `<article class="modelo">
    <header class="modelo-cab">
      <div class="chips"><span class="chip forte">${esc(FORMATO_NOME[formato])}</span><span class="chip">${esc(tema.id)}</span><span class="chip">assunto: ${esc(v.padrao)}</span>${info ? `<span class="chip alerta">${esc(info)}</span>` : ''}</div>
      <div class="caixa-entrada"><b>Precificaí</b><span class="assunto">${esc(m.assunto)}</span><span class="previa">${previa}</span></div>
    </header>
    <div class="telas">
      <figure><figcaption>Computador</figcaption><div class="moldura-pc"><iframe title="${esc(m.assunto)} no computador" srcdoc="${doc}" width="620" loading="lazy" onload="ajusta(this)"></iframe></div></figure>
      <figure><figcaption>Celular</figcaption><div class="moldura-cel"><iframe title="${esc(m.assunto)} no celular" srcdoc="${doc}" width="375" loading="lazy" onload="ajusta(this)"></iframe></div></figure>
    </div>
  </article>`;
}

// ---------- seções ----------

let resumo = '';
let amanha = '';
const doCatalogo: string[] = [];
for (const t of TEMAS) {
  const etapa = t.para === 'mensal' ? 'ativo' : t.para[0];
  for (const v of t.variantes) doCatalogo.push(cartao(t.id, v.formato, etapa, ''));
}

if (simulacao) {
  type Linha = Candidato & { motivo: string; dados: Dados };
  const linhas: Linha[] = JSON.parse(readFileSync(simulacao, 'utf8'));
  const vao = linhas.filter((l) => l.motivo === 'ok');
  const motivos = new Map<string, number>();
  for (const l of linhas) if (l.motivo !== 'ok') motivos.set(l.motivo, (motivos.get(l.motivo) || 0) + 1);
  const modelos = new Map<string, { n: number; tema: string; formato: string; etapas: Set<string> }>();
  let semTema = 0;
  for (const l of vao) {
    const e = escolher(l, l.dados || {});
    if (!e) { semTema++; continue; }
    const k = `${e.tema.id}|${e.variante.formato}`;
    const m = modelos.get(k) || { n: 0, tema: e.tema.id, formato: e.variante.formato, etapas: new Set() };
    m.n++; m.etapas.add(l.estagio); modelos.set(k, m);
  }
  const porEtapa = new Map<string, number>();
  for (const l of vao) porEtapa.set(l.estagio, (porEtapa.get(l.estagio) || 0) + 1);
  const alertas: string[] = [];
  if (vao.length > 150) alertas.push(`${vao.length} pessoas na régua: só 150 saem por dia.`);
  if (semTema) alertas.push(`${semTema} ${semTema === 1 ? 'pessoa já recebeu' : 'pessoas já receberam'} todos os temas. Faltam novidades mensais novas.`);

  resumo = `<section class="resumo" aria-label="Resumo de ${esc(dia)}">
    <div class="grande"><span class="num">${vao.length - semTema}</span><span>e-mails saem ${dia ? `em ${esc(dia)}` : 'amanhã'} às 10h</span></div>
    <div class="grade">
      <div><h3>Por etapa</h3><ul>${[...porEtapa].map(([k, n]) => `<li><span>${esc(ETAPA_NOME[k] || k)}</span><b>${n}</b></li>`).join('') || '<li>Ninguém</li>'}</ul></div>
      <div><h3>Ficam de fora</h3><ul>${[...motivos].sort((a, b) => b[1] - a[1]).map(([k, n]) => `<li><span>${esc(k)}</span><b>${n}</b></li>`).join('') || '<li>Ninguém</li>'}</ul></div>
    </div>
    ${alertas.map((a) => `<p class="aviso">${esc(a)}</p>`).join('')}
  </section>`;
  amanha = [...modelos.values()].sort((a, b) => b.n - a.n)
    .map((m) => cartao(m.tema, m.formato, [...m.etapas][0], `${m.n} ${m.n === 1 ? 'pessoa' : 'pessoas'} · ${[...m.etapas].map((e) => ETAPA_NOME[e]).join(', ')}`)).join('')
    || '<p class="vazio">Nenhum e-mail da régua sai amanhã.</p>';
}

// Sequência de 5 e-mails para uma pessoa que parou no Kit de Início.
const seq: string[] = [];
const pessoa: Candidato = { estagio: 'kit_sem_preco', plano: 'free', fase: 'semanal', temas_recebidos: [], formatos_recentes: [], padroes_recentes: [] };
for (const d of [7, 14, 21, 30, 45]) {
  const e = escolher(pessoa, EXEMPLO);
  if (!e) break;
  seq.push(`<li><span class="dia">Dia ${d}</span>${cartao(e.tema.id, e.variante.formato, pessoa.estagio, '')}</li>`);
  pessoa.temas_recebidos.push(e.tema.id);
  pessoa.formatos_recentes = [e.variante.formato, ...pessoa.formatos_recentes].slice(0, 3);
  pessoa.padroes_recentes = [e.variante.padrao, ...pessoa.padroes_recentes].slice(0, 3);
}

const pagina = `<title>Prévia da Régua</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,600;9..40,700&family=DM+Mono:wght@400;500&display=swap">
<style>
/* Layout: coluna de leitura com o resumo no topo e, abaixo, cada modelo lado a lado (computador | celular). Cores da marca Precificaí. */
:root {
  --bg: #f4f6f5; --surface: #ffffff; --fg: #1a1a2e; --muted: #5f706e; --line: #d8e0de;
  --brand: #004d47; --brand-soft: #e8f3f2; --mint: #00a88c; --warn-bg: #fff4d6; --warn-fg: #6b4e00;
  --sans: 'DM Sans', -apple-system, 'Segoe UI', Roboto, sans-serif; --mono: 'DM Mono', ui-monospace, Menlo, monospace;
}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
  --bg: #0e1615; --surface: #16211f; --fg: #e6eeec; --muted: #9fb2af; --line: #2a3a37;
  --brand: #5fd3bf; --brand-soft: #1b2e2b; --mint: #3fd6b8; --warn-bg: #3a2f0f; --warn-fg: #f3d27a; color-scheme: dark; } }
:root[data-theme="dark"] {
  --bg: #0e1615; --surface: #16211f; --fg: #e6eeec; --muted: #9fb2af; --line: #2a3a37;
  --brand: #5fd3bf; --brand-soft: #1b2e2b; --mint: #3fd6b8; --warn-bg: #3a2f0f; --warn-fg: #f3d27a; color-scheme: dark; }
body { background: var(--bg); color: var(--fg); font-family: var(--sans); font-size: 15px; line-height: 1.5; }
.pagina { max-width: 1080px; margin: 0 auto; padding-inline: 16px; padding-block: 32px 64px; display: grid; gap: 40px; }
h1 { font-size: 30px; line-height: 1.15; margin: 0; text-wrap: balance; }
h2 { font-size: 20px; margin: 0 0 4px; text-wrap: balance; }
h3 { font-size: 12px; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); margin: 0 0 8px; }
.sub { color: var(--muted); margin: 6px 0 0; max-width: 65ch; }
nav { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; }
nav a { color: var(--brand); background: var(--brand-soft); padding: 6px 12px; border-radius: 999px; text-decoration: none; font-weight: 600; font-size: 14px; }
nav a:focus-visible, a:focus-visible { outline: 2px solid var(--mint); outline-offset: 2px; }
.resumo { background: var(--surface); border: 1px solid var(--line); border-radius: 16px; padding: 20px; display: grid; gap: 16px; }
.grande { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; }
.grande .num { font-size: 48px; font-weight: 700; color: var(--brand); font-variant-numeric: tabular-nums; line-height: 1; }
.grade { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 20px; }
.grade ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
.grade li { display: flex; justify-content: space-between; gap: 12px; border-bottom: 1px solid var(--line); padding-block: 4px; }
.grade b { font-variant-numeric: tabular-nums; }
.aviso { background: var(--warn-bg); color: var(--warn-fg); border-radius: 10px; padding: 10px 14px; margin: 0; }
.secao { display: grid; gap: 20px; }
.modelo { background: var(--surface); border: 1px solid var(--line); border-radius: 16px; padding: 16px; display: grid; gap: 14px; min-width: 0; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.chip { font-family: var(--mono); font-size: 12px; padding: 2px 8px; border-radius: 6px; background: var(--brand-soft); color: var(--muted); }
.chip.forte { color: var(--brand); font-weight: 500; }
.chip.alerta { background: var(--warn-bg); color: var(--warn-fg); }
.caixa-entrada { display: grid; grid-template-columns: auto 1fr; column-gap: 12px; align-items: baseline; min-width: 0; }
.caixa-entrada .assunto { font-weight: 700; min-width: 0; }
.caixa-entrada .previa { grid-column: 2; color: var(--muted); font-size: 14px; min-width: 0; }
.telas { display: flex; gap: 16px; overflow-x: auto; align-items: flex-start; }
figure { margin: 0; display: grid; gap: 6px; }
figcaption { font-size: 12px; color: var(--muted); text-transform: uppercase; letter-spacing: .08em; }
iframe { border: 0; display: block; background: #f4f6f5; height: 700px; }
.moldura-pc { border: 1px solid var(--line); border-radius: 10px; overflow: hidden; }
.moldura-cel { border: 8px solid var(--fg); border-radius: 28px; overflow: hidden; }
.sequencia { list-style: none; margin: 0; padding: 0; display: grid; gap: 20px; }
.dia { display: inline-block; font-family: var(--mono); font-weight: 500; color: var(--brand); margin-bottom: 8px; }
.vazio { color: var(--muted); }
details > summary { cursor: pointer; font-weight: 700; font-size: 20px; }
details[open] > summary { margin-bottom: 16px; }
</style>
<main class="pagina">
  <header>
    <h1>Prévia da régua de e-mails${dia ? ` · ${esc(dia)}` : ''}</h1>
    <p class="sub">Cada modelo aparece como o cliente vai ver, no computador e no celular, com os dados da conta de exemplo Doces da Ana. Nenhum e-mail foi enviado para gerar esta página.</p>
    <nav>${simulacao ? '<a href="#amanha">Saem amanhã</a>' : ''}<a href="#sequencia">Sequência de uma pessoa</a><a href="#catalogo">Todos os modelos (${doCatalogo.length})</a></nav>
  </header>
  ${resumo}
  ${simulacao ? `<section class="secao" id="amanha"><div><h2>Modelos que saem amanhã</h2><p class="sub">Um cartão por modelo diferente, com quantas pessoas recebem cada um.</p></div>${amanha}</section>` : ''}
  <section class="secao" id="sequencia"><div><h2>Sequência de uma pessoa</h2><p class="sub">Os 5 primeiros e-mails da régua para quem parou no Kit de Início sem colocar preço, para conferir se cada um parece diferente do anterior.</p></div><ol class="sequencia">${seq.join('')}</ol></section>
  <section class="secao" id="catalogo"><details${simulacao ? '' : ' open'}><summary>Todos os modelos (${doCatalogo.length})</summary><div class="secao">${doCatalogo.join('')}</div></details></section>
</main>
<script>
function ajusta(f) { try { var h = f.contentDocument.documentElement.scrollHeight; if (h > 100) f.style.height = h + 'px'; } catch (e) {} }
</script>
`;
writeFileSync(saida, pagina);
console.log(`prévia: ${saida} (${doCatalogo.length} modelos, sequência de ${seq.length}${simulacao ? ', com simulação' : ''})`);
