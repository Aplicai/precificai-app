-- 2026-09-09 — Bug "atualizei o preço e o relatório continua 'sem preço'":
-- itens (em geral do Kit de Início) com quantidade_liquida = 0 faziam o
-- formulário gravar preco_por_kg = 0 mesmo com valor_pago > 0. O app agora
-- trata líquida vazia como igual à bruta; este backfill corrige as linhas já
-- gravadas (4 linhas em 4 contas no aggregate de 2026-09-09).
UPDATE public.materias_primas
   SET quantidade_liquida = quantidade_bruta
 WHERE COALESCE(quantidade_liquida, 0) <= 0
   AND COALESCE(quantidade_bruta, 0) > 0;

UPDATE public.materias_primas
   SET preco_por_kg = CASE
         WHEN lower(unidade_medida) IN ('g','grama','gramas','ml') THEN valor_pago / quantidade_liquida * 1000
         ELSE valor_pago / quantidade_liquida
       END
 WHERE COALESCE(preco_por_kg, 0) <= 0
   AND COALESCE(valor_pago, 0) > 0
   AND COALESCE(quantidade_liquida, 0) > 0
   AND lower(unidade_medida) IN ('g','grama','gramas','ml','un','unidade','unidades','kg','l','litro');
