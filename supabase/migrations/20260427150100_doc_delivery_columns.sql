-- Sessão 28.9 — Auditoria P2-08: documenta semântica das colunas legadas de
-- delivery_config (nomes confusos por motivo histórico).
--
-- HISTÓRICO: o schema original (~2024) chamava:
--   - taxa_plataforma  → era pra ser "taxa fixa do iFood/Rappi/etc"
--   - comissao_app     → era pra ser "comissão variável %"
--   - embalagem_extra  → era pra ser "taxa de embalagem"
--
-- A REALIDADE: como o app evoluiu, essas colunas passaram a representar:
--   - taxa_plataforma  → COMISSÃO DA PLATAFORMA EM % (0-100)
--   - comissao_app     → REDUNDANTE com taxa_plataforma; antes era usado como R$
--                        em algumas telas (BUG, agora corrigido)
--   - embalagem_extra  → CUPOM DE DESCONTO EM R$ (não embalagem!)
--   - desconto_promocao → desconto promocional em % (0-100)
--   - taxa_entrega     → frete cobrado do cliente em R$
--
-- Renomear as colunas seria invasivo (quebra todas as telas que leem). Em vez
-- disso, esta migration adiciona COMMENTs documentais que aparecem no Supabase
-- Studio e em qualquer ferramenta de schema (pg_dump, dbeaver, etc).
--
-- Próximos passos sugeridos (próxima fase, OPCIONAL):
--   1. Renomear via ALTER TABLE ... RENAME COLUMN ... TO ...
--   2. Criar VIEW backward-compat com nome antigo
--   3. Atualizar todo o código pra usar nome novo

COMMENT ON COLUMN delivery_config.taxa_plataforma IS
  'COMISSÃO da plataforma em PERCENTUAL (ex: 23 = 23%). Apesar do nome legado "taxa", representa a comissão variável que a plataforma cobra sobre o pedido. Use como `valor * (taxa_plataforma / 100)` para obter R$.';

COMMENT ON COLUMN delivery_config.comissao_app IS
  'CAMPO REDUNDANTE / LEGADO. Mantido por backward-compat com alguns usuários. Em código novo prefira `taxa_plataforma`. Algumas telas antigas usavam isso erroneamente como R$ — bug corrigido na Sessão 28.9 P0-03.';

COMMENT ON COLUMN delivery_config.embalagem_extra IS
  'CUPOM DE DESCONTO em REAIS (R$). Apesar do nome legado "embalagem", representa o cupom fixo absorvido pelo restaurante (ex: cupom R$5 do iFood). Subtraído após o desconto percentual.';

COMMENT ON COLUMN delivery_config.desconto_promocao IS
  'Desconto promocional em PERCENTUAL (ex: 10 = 10%). Aplicado primeiro, antes do cupom em R$ e antes da comissão.';

COMMENT ON COLUMN delivery_config.taxa_entrega IS
  'Frete cobrado do cliente em REAIS (R$). Soma à base da comissão (cliente paga preço + frete; comissão incide sobre os dois).';
