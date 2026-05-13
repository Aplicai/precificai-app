/**
 * Feature flags por email — whitelist hardcoded.
 *
 * Diferente de `useFeatureFlag` (que controla MÓDULOS opcionais ligados pelo
 * próprio usuário em Configurações), este módulo define quais features
 * BETA/SISTEMA o usuário tem PERMISSÃO de ver no app, com base no email
 * autenticado. Para liberar acesso pra um novo email, edite a lista e faça
 * deploy.
 *
 * Uso:
 *   import { hasFeature } from '../utils/featureFlags';
 *   if (hasFeature('dre_fluxo_caixa', user?.email)) { ... }
 *
 *   // Ou via hook reativo: useFeatureFlags()
 */

// Lista de e-mails autorizados por feature.
// Para adicionar usuários: edite essa lista e faça novo deploy.
const FLAGS = {
  'dre_fluxo_caixa': [
    'teste@teste.com.br',
    // Adicione outros e-mails aqui
  ],
};

export function hasFeature(flagName, email) {
  if (!email) return false;
  const list = FLAGS[flagName] || [];
  return list.includes(String(email).toLowerCase().trim());
}

export function listFeatures(email) {
  if (!email) return [];
  return Object.keys(FLAGS).filter(k => hasFeature(k, email));
}
