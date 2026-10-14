/**
 * Helpers PUROS do wizard financeiro guiado (FinanceiroConfigScreen).
 *
 * Sem React/RN aqui: tudo testável em Node (`__tests__/financeiroWizard.test.mjs`).
 * A ordem dos passos e a regra de "concluído" seguem `getFinanceiroStatus`
 * (src/utils/financeiroStatus.js) — chaves `lucro`, `faturamento`, `fixas`, `variaveis`.
 */
import { parseDecimalBR } from '../../utils/calculations';

// Ordem em que o wizard pergunta (Margem → Faturamento → Custos do mês → Custos por venda).
// Copy em reais e palavras do dia a dia (dono de negócio de comida, não contador).
// Os 4 passos são obrigatórios (decisão do dono 14/10/2026): sem custos o preço não fica certo.
export const WIZARD_STEPS = [
  {
    key: 'lucro',
    titulo: 'De cada R$ 100 que você vende, quanto quer que sobre pra você?',
    ajuda: 'Digite em %. É o que fica no seu bolso depois de pagar tudo.',
    exemplo: 'Ex.: 20% → em R$ 100 vendidos, sobram R$ 20.',
    pendente: 'Diga quanto quer que sobre de cada R$ 100 para continuar.',
  },
  {
    key: 'faturamento',
    titulo: 'Quanto entra na sua loja por mês, mais ou menos?',
    ajuda: 'Some tudo o que você vende num mês comum. Não precisa ser exato.',
    exemplo: 'Ex.: uma padaria de bairro recebe uns R$ 15.000 por mês.',
    pendente: 'Diga quanto entra por mês, mais ou menos, para continuar.',
  },
  {
    key: 'fixas',
    titulo: 'O que você paga todo mês mesmo sem vender?',
    ajuda: 'Aluguel, luz, água, salários, o seu próprio salário.',
    exemplo: 'Ex.: aluguel R$ 1.200, luz R$ 300, seu salário R$ 2.000.',
    pendente: 'Adicione pelo menos um custo do mês (ex.: aluguel ou luz) para continuar.',
  },
  {
    key: 'variaveis',
    titulo: 'O que sai de cada venda?',
    ajuda: 'Taxa do cartão, imposto, embalagem do delivery: o que some de cada venda.',
    exemplo: 'Ex.: taxa da maquininha 3,5% e imposto 6%.',
    pendente: 'Adicione pelo menos um custo por venda (ex.: taxa da maquininha) para continuar.',
  },
];

/**
 * Exemplo ao vivo da margem em reais: "Em R$ 100 vendidos, sobram R$ 20".
 * Recebe o texto do input (PT-BR). Inválido/zero → '' (nada a mostrar).
 */
export function exemploMargemEmReais(str) {
  const r = validarLucroInput(str);
  if (!r.ok || !(r.valor > 0)) return '';
  const sobra = Math.round(r.valor * 100 * 100) / 100;
  const txt = Number.isInteger(sobra) ? String(sobra) : sobra.toFixed(2).replace('.', ',');
  return `Em R$ 100 vendidos, sobram R$ ${txt}`;
}

export const SUGESTOES_LUCRO = [10, 20, 30];

export function wizardProgressLabel(index, total = WIZARD_STEPS.length) {
  const i = Math.min(Math.max(Number(index) || 0, 0), total - 1);
  return `Passo ${i + 1} de ${total}`;
}

/** true quando o status foi carregado e falta qualquer passo (`completo` do
 * financeiroStatus: margem, faturamento, custos do mês e custos por venda). */
export function deveMostrarWizard(status) {
  return !!status && status.completo === false;
}

export function passoConcluido(status, key) {
  const etapa = status?.etapas?.find(e => e.key === key);
  return etapa?.done === true;
}

/**
 * Texto inline de pendência do passo (`pendente`), mostrado perto do Continuar.
 * Só aparece depois que o usuário tentou continuar NESTE passo (`tentativaKey`)
 * e some sozinho quando o passo fica concluído (ex.: adicionou um custo).
 * No web o Alert.alert não aparecia de forma confiável — o texto inline é a fonte.
 */
export function mensagemPendenteWizard(status, stepKey, tentativaKey) {
  if (!stepKey || stepKey !== tentativaKey) return '';
  const step = WIZARD_STEPS.find(s => s.key === stepKey);
  if (!step || passoConcluido(status, stepKey)) return '';
  return step.pendente;
}

/** Índice (em WIZARD_STEPS) do primeiro passo pendente; 0 sem status; -1 se tudo feito. */
export function primeiroPassoPendente(status) {
  if (!status?.etapas) return 0;
  const idx = WIZARD_STEPS.findIndex(step => !passoConcluido(status, step.key));
  return idx;
}

/**
 * Valida a margem de lucro digitada (em %, texto PT-BR). Mesma regra do
 * autosave do formulário completo: NaN ou negativo → erro. Zero é aceito
 * (grava 0), mas não conta como etapa concluída.
 * Retorna { ok, valor } com `valor` em FRAÇÃO (20 → 0.2).
 */
export function validarLucroInput(str) {
  const p = parseDecimalBR(str);
  if (!Number.isFinite(p) || p < 0) {
    return { ok: false, valor: NaN, erro: 'Digite uma margem de lucro válida (ex.: 20).' };
  }
  if (p >= 100) {
    return { ok: false, valor: NaN, erro: 'A margem precisa ser menor que 100%.' };
  }
  return { ok: true, valor: p / 100, erro: '' };
}

/** Faturamento médio mensal: precisa ser número > 0. Retorna { ok, valor } em R$. */
export function validarFaturamentoInput(str) {
  const v = parseDecimalBR(str);
  if (!Number.isFinite(v) || v <= 0) {
    return { ok: false, valor: NaN, erro: 'O faturamento médio deve ser maior que zero.' };
  }
  return { ok: true, valor: v, erro: '' };
}

/**
 * Mark-up numérico → texto PT-BR com vírgula ("1,95x"). Todo o resto da tela
 * usa vírgula decimal; o mark-up saía "1.95x" (toFixed puro). NaN/≤0 → '∞'
 * (a tela não exibe o símbolo: usa MARKUP_NAO_FECHA no lugar).
 */
/** Texto exibido no lugar do mark-up quando custos + lucro ≥ 100% do preço. */
export const MARKUP_NAO_FECHA = 'Não fecha: custos + lucro passam de 100% do preço. Reduza a margem ou os custos.';

export function formatMarkup(markup) {
  if (!Number.isFinite(markup) || markup <= 0) return '∞';
  return `${markup.toFixed(2).replace('.', ',')}x`;
}

/** Fração → texto PT-BR pro input (0.2 → "20", 0.125 → "12,5"). */
export function fracaoParaInputPercentual(fracao) {
  if (!Number.isFinite(fracao) || fracao <= 0) return '';
  const pct = Math.round(fracao * 1000) / 10;
  return String(pct).replace('.', ',');
}
