# Montar a receita tocando (com IA grátis)

Validado com o Erick entre 19 e 21/10/2026. Protótipo aprovado (v7): https://claude.ai/artifact/LUBhBFDrjRXf8ucyQUSxfF

## Problema

- Desde as mudanças de 19/10, 35% chegam ao 1º preço, mas 57% saem antes de fazer qualquer coisa:
  - 20% param no perfil;
  - 37% não colocam nenhum ingrediente.
- O Preço rápido pergunta "quanto custa a receita?" e a maioria não sabe.
- Retorno em outro dia: 9%. Pagantes da campanha: 0.

## Decisões

- A pessoa monta a receita **tocando** nos ingredientes sugeridos. O preço aparece já no 1º toque e muda a cada toque.
- Custo zero no começo:
  - base própria primeiro;
  - Gemini gratuito só para produto fora da base.
- **Privacidade:** o Erick aceita o plano grátis do Gemini por enquanto. Para o Google só vai nome do produto, segmento e porção. Nunca nome, e-mail, telefone ou ID. Trocar por IA paga quando houver receita.
- Os preços sempre vêm da conta da pessoa ou da nossa base, **nunca da IA**.

## Experiência (igual à v7)

1. "Qual produto?" e "Quanto você cobra hoje? (opcional)". Botão "Montar minha receita".
2. Em 1 a 3 s: os ingredientes sugeridos aparecem como botões ("+ Cenoura · 300 g"), acima da lista.
   - Topo fixo: "Venda cada fatia por (até agora) R$ X · n de N ingredientes".
3. Montagem:
   - tocar um botão põe o ingrediente na receita;
   - tocar na receita muda quantidade ou preço pago, ou tira o ingrediente;
   - "Adicionar todos";
   - "+ Outro ingrediente" ("100 g de coco ralado");
   - "A receita inteira rende [N] porções";
   - a embalagem entra como 1 por porção.
4. "Ver meu preço" leva ao resultado:
   - preço e a explicação do que ele paga;
   - perda por porção e por mês, para quem disse quanto cobra;
   - tabela de preços desde o 1º produto (WhatsApp e copiar);
   - "Usar os seus gastos do mês";
   - aviso "te aviso quando um ingrediente subir".
5. No próximo produto, o que a pessoa já usou aparece como "já é seu", com o preço dela.

Fora do primeiro acesso, a ficha do produto e a receita base continuam como hoje.

## De onde vêm os ingredientes

1. **Base própria:** `produtos_templates` + `preparos_templates` + `dicionario` com 382 insumos, comparando pelo nome. Ampliar para 100 a 150 produtos dos nichos que mais se cadastram.
2. **Gemini** (`gemini-3.5-flash-lite`), só se a base não achar o produto. Sai pela edge function `montar-receita`, com resposta em JSON por schema: porção, rende, ingredientes (nome, quantidade, unidade g/ml/un) e embalagem.
3. **Lista comum do segmento** (confeitaria, salgados, lanches...), se o Gemini falhar, demorar mais de 8 s ou estourar a cota.

Os nomes da IA passam pelo `matchInsumo` para pegar o preço médio da base.
- **Ingrediente sem par na base:** entra marcado "sem preço". Não soma no custo, e a tela avisa "1 ingrediente sem preço, toque para pôr".
- **Quantidade fora do normal:** zero, mais de 20 kg ou mais de 200 un é descartada.

## Técnica

- **Edge function `montar-receita`:**
  - exige JWT;
  - limite de 10 montagens por conta por dia, contado no banco como no `link_acesso_reservar`;
  - chave `GEMINI_API_KEY` só no secret do Supabase;
  - tempo limite de 8 s;
  - 1 nova tentativa em erro 503;
  - em 429 ou 5xx, devolve `{fonte: "segmento"}`.
- **Salvar:**
  - cada ingrediente vira `materias_primas`, reaproveitando o da conta pelo nome;
  - o produto guarda `rendimento_unidades = rende`;
  - os ingredientes vão em `produto_ingredientes`, com as quantidades da receita inteira;
  - a embalagem vai em `produto_embalagens`;
  - continua contando no limite de 5 produtos do Grátis.
- **Liberação:** só para cadastros novos, com flag para ligar e desligar. Comparar a ativação contra a turma de 19 a 21/10.
- **Política de privacidade:** citar o envio do nome do produto ao Google para sugerir receitas.

## Erros

- Sem internet ou falha da função: usar a lista do segmento e "+ Outro ingrediente". Nunca travar.
- Sem nenhum ingrediente: "Ver meu preço" pede ao menos 1.
- Rende 0: o mínimo é 1.

## Testes

- **Automáticos:**
  - comparação de nomes com a base;
  - validação da resposta da IA;
  - custo por porção (incluindo embalagem por porção);
  - limite diário;
  - alternativas quando o Gemini falha.
- **Na tela:** a bateria `teste7.cjs` do protótipo, adaptada ao app, no celular, no celular pequeno e no computador.

## Sucesso (7 dias após publicar)

- Chegam ao 1º preço: de 35% para 50% ou mais.
- Completam 3 produtos: de 7% para 12% ou mais.
- Saem antes de qualquer ação: de 57% para 40% ou menos.
- Voltam em outro dia: de 9% para 15% ou mais.
