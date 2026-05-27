-- Sessão 28.9 — Auditoria P2-08: documenta semântica das colunas legadas de
-- delivery_config (nomes confusos por motivo histórico).
--
-- ATUALIZADO (Sessão 28.73, arq #3/D1): os COMMENTs anteriores estavam DEFASADOS
-- e contradiziam a FONTE DA VERDADE do código — `src/utils/deliveryAdapter.js`
-- (`normalizePlataforma` / `plataformaParaParamsDelivery`), usado pelo engine
-- `calcularPrecoDelivery` e por 5 telas. Corrigidos pra bater com o adapter.
--
-- HISTÓRICO: o schema original (~2024) chamava taxa_plataforma/comissao_app/
-- embalagem_extra com a intenção de "taxa fixa / comissão variável / taxa de
-- embalagem". O app evoluiu e essas colunas passaram a significar outra coisa.
--
-- MAPA LEGACY → SEMÂNTICA REAL (espelha deliveryAdapter.js):
--   taxa_plataforma   → COMISSÃO da plataforma            % (0–100)
--   comissao_app      → TAXA DE PAGAMENTO ONLINE          % (0–100)  [ATIVO]
--   desconto_promocao → CUPOM de desconto recorrente      R$
--   taxa_entrega      → FRETE SUBSIDIADO (absorvido)      R$
--   outros_perc       → Outras taxas embutidas            % (0–100)
--   embalagem_extra   → [DEPRECATED — não usar]            —
--   ativo             → Plataforma ativa                  INT 0/1
--
-- Renomear as colunas seria invasivo (quebra todas as telas que leem). Em vez
-- disso, esta migration mantém COMMENTs documentais que aparecem no Supabase
-- Studio e em qualquer ferramenta de schema (pg_dump, dbeaver, etc).
--
-- Próximos passos sugeridos (próxima fase, OPCIONAL):
--   1. Renomear via ALTER TABLE ... RENAME COLUMN ... TO ... (nomes do adapter)
--   2. Criar VIEW backward-compat com nome antigo
--   3. Atualizar todo o código pra usar nome novo

COMMENT ON COLUMN delivery_config.taxa_plataforma IS
  'COMISSÃO da plataforma em PERCENTUAL (ex: 23 = 23%). Apesar do nome legado "taxa", representa a comissão variável que a plataforma cobra sobre o pedido. No código: deliveryAdapter → comissaoPct = taxa_plataforma/100.';

COMMENT ON COLUMN delivery_config.comissao_app IS
  'TAXA DE PAGAMENTO ONLINE em PERCENTUAL (ex: 3.5 = 3,5%). Apesar do nome legado "comissao_app", representa a taxa de processamento de pagamento online. ATIVO — no código: deliveryAdapter → taxaOnlinePct = comissao_app/100.';

COMMENT ON COLUMN delivery_config.embalagem_extra IS
  'DEPRECATED — não usar. Coluna legada sem semântica ativa no engine (deliveryAdapter marca como descontinuada). Mantida só por backward-compat de dados antigos; não entra no cálculo de preço.';

COMMENT ON COLUMN delivery_config.desconto_promocao IS
  'CUPOM de desconto recorrente em REAIS (R$). Apesar do nome legado "desconto_promocao", representa o cupom fixo absorvido pelo restaurante (ex: cupom R$5 do iFood). No código: deliveryAdapter → cupomR = desconto_promocao.';

COMMENT ON COLUMN delivery_config.taxa_entrega IS
  'FRETE SUBSIDIADO (absorvido pelo restaurante) em REAIS (R$). Apesar do nome legado "taxa_entrega", NÃO é frete cobrado do cliente — é o frete que o negócio banca. O engine soma à base de custo (eleva o preço sugerido pra recuperar o que foi absorvido). No código: deliveryAdapter → freteSubsidiadoR = taxa_entrega.';
