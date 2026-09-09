/**
 * Helpers PUROS do wizard financeiro guiado (FinanceiroConfigScreen).
 *
 * Sem React/RN aqui: tudo testável em Node (`__tests__/financeiroWizard.test.mjs`).
 * A ordem dos passos e a regra de "concluído" seguem `getFinanceiroStatus`
 * (src/utils/financeiroStatus.js) — chaves `lucro`, `faturamento`, `fixas`, `variaveis`.
 */
import { parseDecimalBR } from '../../utils/calculations';

// Ordem em que o wizard pergunta (Margem → Faturamento → Custos do mês → Custos por venda).
export const WIZARD_STEPS = [
  {
    key: 'lucro',
    titulo: 'Quanto você quer ganhar por venda?',
    ajuda: 'É a sua margem de lucro, em % do preço.',
    exemplo: 'Ex.: uma confeitaria costuma ficar entre 15% e 30%.',
    pendente: 'Digite uma margem maior que zero para continuar.',
  },
  {
    key: 'faturamento',
    titulo: 'Quanto entra por mês?',
    ajuda: 'Some tudo o que você vende num mês comum.',
    exemplo: 'Ex.: uma padaria de bairro fatura R$ 15.000/mês.',
    pendente: 'Informe quanto você fatura por mês para continuar.',
  },
  {
    key: 'fixas',
    titulo: 'O que você paga todo mês?',
    ajuda: 'Contas que saem mesmo sem vender nada.',
    exemplo: 'Ex.: aluguel R$ 1.200, luz R$ 300 e o seu pró-labore.',
    pendente: 'Adicione pelo menos um custo do mês para continuar.',
  },
  {
    key: 'variaveis',
    titulo: 'O que sai de cada venda?',
    ajuda: 'Percentuais descontados toda vez que alguém compra.',
    exemplo: 'Ex.: taxa da maquininha 3,5% e Simples 6%.',
    pendente: 'Adicione pelo menos um custo por venda para continuar.',
  },
];

export const SUGESTOES_LUCRO = [10, 20, 30];

export function wizardProgressLabel(index, total = WIZARD_STEPS.length) {
  const i = Math.min(Math.max(Number(index) || 0, 0), total - 1);
  return `Passo ${i + 1} de ${total}`;
}

/** true quando o status foi carregado e a configuração NÃO está completa. */
export function deveMostrarWizard(status) {
  return !!status && status.completo === false;
}

export function passoConcluido(status, key) {
  const etapa = status?.etapas?.find(e => e.key === key);
  return etapa?.done === true;
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

/** Fração → texto PT-BR pro input (0.2 → "20", 0.125 → "12,5"). */
export function fracaoParaInputPercentual(fracao) {
  if (!Number.isFinite(fracao) || fracao <= 0) return '';
  const pct = Math.round(fracao * 1000) / 10;
  return String(pct).replace('.', ',');
}
