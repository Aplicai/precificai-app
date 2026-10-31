/**
 * Primeiro acesso: "O que você vende?" (31/10/2026).
 *
 * Auditoria em 326 cadastros: a tela de perfil exigia nome do negócio e
 * segmento em texto livre; 68 pessoas (21%) pararam nela e nenhuma voltou.
 * O segmento virou chips (uma palavra que o `nichoDoSegmento` e o
 * `produtoDoSegmento` já entendem), nada é obrigatório, e quem viu a tela
 * uma vez não é mandado de volta (flag `perfil_setup_visto`).
 *
 * Puro, sem React/RN (testado em __tests__/perfilSetup.test.mjs).
 */

export const SEGMENTO_OUTRO = 'Outro';

/** Chips do setup, na ordem da tela. Cada palavra cai num ramo conhecido. */
export const SEGMENTOS_SETUP = [
  'Confeitaria', 'Salgados', 'Marmitas', 'Lanches', 'Hamburgueria',
  'Pizzaria', 'Padaria', 'Bebidas', SEGMENTO_OUTRO,
];

/**
 * Marcada pela PerfilScreen (setup) em "Continuar" e "Pular por agora".
 * Mesmo padrão global de `preco_rapido_visto` (initialRoute.js).
 */
export const CHAVE_PERFIL_SETUP = 'perfil_setup_visto';

const norm = (s) => String(s ?? '').trim().toLowerCase();

/** Chip que representa o segmento salvo: o próprio, "Outro" para texto livre, null se vazio. */
export function chipDoSegmento(segmento) {
  const t = norm(segmento);
  if (!t) return null;
  return SEGMENTOS_SETUP.find((c) => c !== SEGMENTO_OUTRO && norm(c) === t) || SEGMENTO_OUTRO;
}

/** Valor de `perfil.segmento` para o chip tocado ("Outro" usa o texto digitado). */
export function segmentoDoChip(chip, outroTexto = '') {
  if (!chip) return '';
  if (chip === SEGMENTO_OUTRO) return String(outroTexto ?? '').trim();
  return chip;
}

/**
 * Rota inicial para conta sem `onboarding_done`.
 *  - tem ingrediente → MainTabs (o app já foi usado)
 *  - sem segmento, sem nome e sem ter visto o setup → ProfileSetup
 *  - senão → PrecoRapido uma vez, depois MainTabs (`preco_rapido_visto`)
 *
 * @param {{perfil: object|null, temIngredientes: boolean, setupVisto: boolean, precoRapidoVisto: boolean}} p
 * @returns {'ProfileSetup'|'PrecoRapido'|'MainTabs'}
 */
export function rotaInicialDoPerfil({ perfil, temIngredientes, setupVisto, precoRapidoVisto }) {
  if (temIngredientes) return 'MainTabs';
  const temSegmento = !!norm(perfil?.segmento);
  const temNome = !!norm(perfil?.nome_negocio);
  if (!temSegmento && !temNome && !setupVisto) return 'ProfileSetup';
  return precoRapidoVisto ? 'MainTabs' : 'PrecoRapido';
}
