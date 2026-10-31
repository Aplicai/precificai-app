/**
 * Quanto tempo a sessão fica viva sem uso (31/10/2026).
 *
 * Antes: 24 h para todo mundo, 30 dias só com "Lembrar de mim" marcado no
 * login. Quem entra pelo Google no cadastro nunca vê essa opção, e 84% dos
 * cadastros são pelo Google: toda volta em outro dia caía na tela de login
 * (89 contas da Rodada 1 tiveram de logar de novo).
 * Regra agora: celular é aparelho pessoal, 30 dias sempre. Computador pode
 * ser compartilhado: 24 h, ou 30 dias com "Lembrar de mim".
 */
export const TIMEOUT_30_DIAS = 30 * 24 * 60 * 60 * 1000;
export const TIMEOUT_24_HORAS = 24 * 60 * 60 * 1000;

export function ehCelular(ua) {
  return /iPhone|iPad|iPod|Android/i.test(String(ua || ''));
}

export function timeoutInatividade({ lembrar, celular }) {
  return lembrar || celular ? TIMEOUT_30_DIAS : TIMEOUT_24_HORAS;
}
