/**
 * Migração do rendimento das receitas base do Kit de Início (19/10/2026).
 *
 * O commit 5d2b02d corrigiu o rendimento_total de 7 receitas do kit, que
 * rendiam mais do que os ingredientes pesam (ex.: Brigadeiro tradicional
 * 600 g com 455 g de ingredientes). Como o Kit grava
 * custo_por_kg = custo / rendimento, quem carregou o kit antes ficou com custo
 * por grama baixo demais.
 *
 * Regra (aprovada pelo dono): só corrige receita que o usuário NÃO mexeu.
 *   - nome exatamente igual ao do kit;
 *   - rendimento ainda IGUAL ao antigo e em gramas;
 *   - mesmos ingredientes (nome do insumo + quantidade), nem a mais nem a menos;
 *   - sem sub-receitas.
 * Os ingredientes dessas 7 receitas nunca mudaram no template desde que foram
 * criados (1cfc43f), então dá para comparar com o template atual.
 *
 * Puro (sem Supabase) para ser testado em Node. A execução fica em
 * src/services/migracaoRendimentoKit.js.
 */
import { PREPAROS_POR_SEGMENTO } from '../data/templates';

export const FLAG_MIGRACAO_RENDIMENTO_KIT = 'migracao_kit_rendimento_2026_10';

export const RENDIMENTOS_KIT_CORRIGIDOS = {
  'Brigadeiro tradicional': { antigo: 600, novo: 400 },
  'Beijinho': { antigo: 550, novo: 450 },
  'Molho de tomate caseiro': { antigo: 1000, novo: 750 },
  'Recheio coxinha de frango': { antigo: 1000, novo: 900 },
  'Massa de coxinha': { antigo: 1200, novo: 1000 },
  'Recheio frango catupiry': { antigo: 1000, novo: 900 },
  'Recheio carne moída': { antigo: 800, novo: 550 },
};

export const NOMES_RECEITAS_KIT_CORRIGIDAS = Object.keys(RENDIMENTOS_KIT_CORRIGIDOS);

const UNIDADE_KIT = 'Grama(s)';

const receitaDoKit = (() => {
  const todas = Object.values(PREPAROS_POR_SEGMENTO).flat();
  const out = {};
  for (const nome of NOMES_RECEITAS_KIT_CORRIGIDAS) out[nome] = todas.find(p => p.nome === nome) || null;
  return out;
})();

const assinatura = (pares) => pares
  .map(([nome, qt]) => `${String(nome ?? '').trim()}|${Math.round(Number(qt) * 1000) / 1000}`)
  .sort()
  .join('\n');

export function migracaoRendimentoKitFeita(userMetadata) {
  return !!(userMetadata && userMetadata[FLAG_MIGRACAO_RENDIMENTO_KIT]);
}

/**
 * Filtra receitas candidatas só pelo que está na própria linha de `preparos`
 * (nome + rendimento antigo + unidade). Usado para evitar leituras extras.
 */
export function candidatasPorLinha(preparos) {
  if (!Array.isArray(preparos)) return [];
  return preparos.filter((p) => {
    const regra = RENDIMENTOS_KIT_CORRIGIDOS[p?.nome];
    return !!regra
      && Number(p.rendimento_total) === regra.antigo
      && (p.unidade_medida ?? UNIDADE_KIT) === UNIDADE_KIT;
  });
}

/**
 * @param {{preparos, ingredientes, materias, subpreparos}} dados linhas cruas
 * @returns {Array<{id, nome, antigo, novo}>} receitas a corrigir
 */
export function selecionarPreparosParaMigrar(dados) {
  if (!dados || typeof dados !== 'object') return [];
  const { preparos, ingredientes = [], materias = [], subpreparos = [] } = dados;
  const nomeInsumo = new Map((materias || []).map(m => [m.id, m.nome]));
  const comSub = new Set((subpreparos || []).map(s => s.preparo_id));
  const out = [];
  for (const p of candidatasPorLinha(preparos)) {
    const kit = receitaDoKit[p.nome];
    if (!kit || comSub.has(p.id)) continue;
    const doUsuario = (ingredientes || [])
      .filter(i => i.preparo_id === p.id)
      .map(i => [nomeInsumo.get(i.materia_prima_id), i.quantidade_utilizada]);
    if (doUsuario.some(([nome]) => nome == null)) continue;
    const esperado = kit.ingredientes.map(i => [i.nome_insumo, i.quantidade]);
    if (assinatura(doUsuario) !== assinatura(esperado)) continue;
    const { antigo, novo } = RENDIMENTOS_KIT_CORRIGIDOS[p.nome];
    out.push({ id: p.id, nome: p.nome, antigo, novo });
  }
  return out;
}

export function mensagemMigracaoRendimentoKit(corrigidos) {
  const nomes = (corrigidos || []).map(c => c.nome);
  const exemplo = nomes.includes('Brigadeiro tradicional') ? 'Brigadeiro tradicional' : nomes[0];
  const ex = exemplo ? ` (ex.: ${exemplo})` : '';
  return `Revisamos o rendimento de receitas do Kit de Início${ex}. Os custos foram atualizados; seus preços de venda não mudaram.`;
}
