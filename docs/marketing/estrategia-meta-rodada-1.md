# Estratégia Meta — rodada 1 (14/10/2026)

## 1. Como a venda acontece hoje

```
Anúncio → cadastro grátis (sem cartão) → Kit de Início do segmento (2 produtos prontos)
→ pessoa cadastra os próprios produtos → no 6º produto bate o limite do Grátis
→ popup de upgrade → Pro R$ 29,90/mês ou R$ 322,90/ano no Pix → webhook Asaas → Purchase no Meta
```

O anúncio não vende o Pro. Ele traz a pessoa certa para o grátis. A venda acontece
quando ela usa o app de verdade e bate no limite de 5 produtos. Portanto a campanha
tem que otimizar para **cadastro de dono de negócio que usa o app**, não para
cadastro qualquer.

Risco principal: os vídeos mostram lanche, pizza e preço. Sem filtro de público,
o Meta entrega para quem **gosta de comer hambúrguer**, cadastro barato e inútil.

## 2. Públicos que o Meta oferece hoje (medido no Gerenciador em 14/10)

| Opção | Tipo | Tamanho Brasil |
|---|---|---|
| Administradores de Página sobre Comida e Restaurante | Comportamento | **261 mil a 307 mil** |
| Proprietários de pequenas empresas | Comportamento | (global 51-60 mi) |
| Administradores de página comercial | Comportamento | (global 65-77 mi) |
| Administradores do perfil comercial do Instagram | Comportamento | (global 91-107 mi) |
| Food Service / Serviço de alimentação | Interesse | (global 71-92 mi) |
| Restaurantes, Gastronomia | Interesse | consumidor, não serve sozinho |

"Administradores de Página sobre Comida e Restaurante" é exatamente o público pedido:
quem administra Página de negócio de comida. 261-307 mil no Brasil é tamanho bom
para R$ 50/dia (não satura em semanas).

Lacuna: muita confeiteira e salgadeira de casa vende só pelo Instagram, sem Página
do Facebook. Ela não entra nesse comportamento. Cobertura dela vem de
"Administradores do perfil comercial do Instagram" cruzado com interesse em comida.

## 3. Avaliação dos nichos

Critérios: tamanho da dor de preço, encaixe com o app (ficha técnica, delivery,
receitas base), quão digital é o dono, disposição de pagar R$ 29,90, e se já
temos vídeo para ele.

| Nicho | Dor de preço | Encaixe app | Digital | Paga? | Vídeo pronto | Nota |
|---|---|---|---|---|---|---|
| Hamburgueria / lanchonete | Alta (iFood, insumo) | Alto (delivery, combos) | Alto | Sim | **02, 03, 05, 07, 10** | **A** |
| Pizzaria | Alta (tamanhos, delivery) | Alto | Médio-alto | Sim | **04** | **A** |
| Confeitaria / doceria | **Altíssima** ("quanto cobrar no bolo") | Alto (receitas base) | Altíssimo (Instagram) | Médio (muita gente de casa) | **nenhum** | **A, falta criativo** |
| Salgaderia | Alta (cento, encomenda) | Alto | Alto | Médio | nenhum | B |
| Açaí | Média (adicionais, delivery) | Médio-alto | Alto | Sim | nenhum | B |
| Marmitaria | Alta (margem fina) | Alto | Médio | Médio | nenhum | B |
| Restaurante | Média | Médio (self-service por kg encaixa menos) | Médio-baixo | Sim | 08, 09 genéricos | C |
| Padaria | Média | Médio (muitos itens, costuma ter sistema) | Baixo | Sim | nenhum | C |
| Cafeteria, sorveteria, japonesa | Média | Médio | Médio | Sim | nenhum | C |

Leitura: **rodada 1 em "lanches e delivery"** (hamburgueria, lanchonete, pizzaria,
açaí), porque os 7 vídeos falam com eles. **Confeitaria é o maior potencial e não tem
vídeo**: vira rodada 2 com 2 ou 3 vídeos próprios (bolo, encomenda, receita base).

Antes de fechar o nicho, conferir com dado real quem já cadastra e quem já paga
(consulta na seção 7).

## 4. Estrutura da campanha

### Campanha A — Aquisição (R$ 50/dia, rodada 1)

- **Objetivo:** Vendas (conversões no site).
- **Evento de otimização:** `CompleteRegistration` na largada (precisa de volume:
  ~50/semana). Compra ainda é rara demais para o Meta aprender.
- **Destino:** `app.precificaiapp.com/register` com UTM por anúncio.
- **1 conjunto** (verba não comporta dividir):
  - Brasil, 22 a 60 anos, todos os gêneros.
  - Público por opções originais, não Advantage+ (com Advantage+ o filtro vira
    sugestão e o Meta escapa para consumidor).
  - Incluir quem corresponde a QUALQUER um:
    - Comportamento: Administradores de Página sobre Comida e Restaurante
    - Interesse: Food Service, Serviço de alimentação
  - E também corresponder a QUALQUER um (restringir):
    - Proprietários de pequenas empresas, Administradores de página comercial,
      Administradores do perfil comercial do Instagram, Administradores de Página
      sobre Comida e Restaurante
  - Posicionamentos automáticos (Reels, Stories, Feed).
- **7 anúncios:** 02, 03, 04, 07, 08, 09, 10 (textos em `video/entregas/textos-rodada-1.md`).
- **Ajuste de texto:** primeira linha de cada anúncio qualifica o leitor
  ("Para quem vende lanche...", "Dono de hamburgueria:") e espanta consumidor.

### Campanha B — Remarketing (liga quando público > 2-3 mil)

Públicos criados no dia 1, acumulando:
1. Viu 50% de qualquer vídeo, 30 dias.
2. Engajou com Instagram @precificai.app, 30 dias.
3. Visitou site e não cadastrou (Pixel), 30 dias.
4. Cadastrou e não comprou (Pixel `CompleteRegistration` menos `Purchase`), 60 dias.

Conjuntos:
- B1: públicos 1 a 3, excluindo cadastrados. Mensagem: "crie sua conta grátis".
- B2: público 4. Mensagem: o que o Pro libera, Pix anual com 10% de desconto.

Verba quando ligar: 80% A, 20% B.

### Fora do Meta (onde a venda de fato fecha)

O cadastrado sem assinatura é pouca gente para anúncio no começo. Converte melhor com:
- e-mail automático no dia 1, 3 e 7 (como usar o kit, primeiro alerta de prejuízo,
  limite de 5 produtos);
- aviso dentro do app quando chega a 4 de 5 produtos.

## 5. Evolução do evento de otimização (o que faz a venda acontecer)

| Fase | Quando | Otimizar por |
|---|---|---|
| 1 | Largada | `CompleteRegistration` |
| 2 | Com ~30 ativações/semana | **Evento de ativação** (proposta abaixo) |
| 3 | Com ~30 compras/semana | `Purchase` |

**Proposta (código, não feito ainda):** evento `Ativacao` disparado quando a pessoa
cadastra o 3º produto próprio. Indica dono de negócio real usando o app. Otimizar
por ele filtra curioso muito melhor que cadastro, e está a um passo do limite de 5
que gera a venda.

## 6. Leitura dos resultados

Métrica de decisão não é custo por cadastro, é **custo por assinante**:

```
custo por assinante = gasto ÷ assinaturas Pro vindas de utm_source=meta
```

Origem gravada no perfil (`auth.users.raw_user_meta_data->'attribution'`).
Nicho bom = baixo custo por assinante, não baixo custo por clique.

## 7. Dado que falta (rodar no SQL Editor do Supabase)

Só contagens, sem dado pessoal:

```sql
select coalesce(nullif(p.segmento, ''), '(sem segmento)') as segmento,
       count(*) as contas,
       count(*) filter (where s.plan <> 'free' and s.status = 'active') as pagantes
from perfil p
left join subscriptions s on s.user_id = p.user_id
group by 1
order by contas desc;
```
