# Anúncios 02 a 10: tráfego pago (Meta Reels/Stories)

Design validado em brainstorm com o dono em 13/10/2026. Continua `anuncio-01-trafego-pago.design.md`.

## Ponto de partida

Anúncio 01 aprovado ("Lanche de R$ 21"): colagem documental, mesa vista de cima com câmera viajando entre estações (referência earn.edits/Listerine), voz Gemini Fenrir, trilha e efeitos, 25 s, CTA conta grátis. Master no Drive: `03_PRECIFICAÍ/Vídeos - Anúncios`.

## Decisões

| Tema | Decisão |
|---|---|
| Papel dos 9 | 6 para público frio + 3 de remarketing |
| Formato | Mesa como base (6 vídeos) + 3 formatos novos (chat, quiz, tela gravada) |
| Padrão | 9:16, 1080x1920, 20 a 25 s, legenda sempre visível, zona segura do Reels |
| Estrutura | Gancho (3 s), prova com número real (8 a 10 s), app resolvendo (6 a 8 s), CTA (3 s) |
| CTA | "Crie sua conta grátis. Sem cartão." |
| Voz | Gemini Fenrir, roteiro inteiro em uma tomada, fiel ao texto |
| Números | Só o que existe no app. Captura a tela antes de fechar o roteiro |
| Texto | Nunca travessão, frases curtas |

## Grade

### Frios

| # | Ângulo | Gancho | Formato | Dado real |
|---|---|---|---|---|
| 2 | Campeão no prejuízo | "Cada vez que esse lanche sai, você paga um e noventa e oito pra vender." | Mesa | X FILE SUINO EGG BACON, venda R$ 30,00, lucro −R$ 1,98 |
| 3 | Taxa do delivery | "Mesmo lanche, mesmo preço. No balcão sobra. No aplicativo, some." | Mesa | Precificação de delivery (conferir config da conta) |
| 4 | Ingrediente subiu | "A mussarela subiu de novo. E o seu preço, subiu?" | Mesa | Atualizar Preços, recálculo em cascata |
| 5 | Achômetro | "Meu concorrente cobra vinte e um. Vou cobrar vinte." | Mesa | X BURGUER do anúncio 01 |
| 6 | Cadê o dinheiro? | Chat: "Vendemos 400 lanches esse mês." "E sobrou quanto?" | Chat | Home: "25 produtos com margem baixa" |
| 7 | Quiz | "Quanto custa fazer este lanche? Quatro, seis ou nove reais?" | Quiz | Custo real R$ 6,34 |

### Remarketing

| # | Ângulo | Gancho | Formato | Dado real |
|---|---|---|---|---|
| 8 | Demo cronometrada | "Preço certo do seu lanche em um minuto. Pode contar." | Tela gravada | Cronometrar de verdade; se passar, muda a promessa |
| 9 | Sem planilha | "Você não precisa saber mexer em planilha." | Mesa | Kit de Início (conferir como aparece) |
| 10 | Quanto vender por dia | "Antes de sobrar um real, esta lanchonete precisa vender mil setecentos e oitenta e três por dia." | Mesa | Home: "Mínimo pra pagar as contas" |

Reserva: "Preço alto não é lucro" (porção de R$ 85 com prejuízo de R$ 1,16). O caso @apetite.lanches saiu por depender de autorização e fala real do cliente.

## Produção

O anúncio 01 vira molde:

- Mesa e câmera: fundo, grão, vinheta, viagem entre estações (`pose`/`travel`).
- Objetos: biblioteca de recortes, ampliada conforme cada roteiro.
- Peças de cena: comanda, post-it, etiqueta de preço, celular com tela real, número gigante, tarja de CTA.
- Som: `voz/gemini_tts.py`, `voz/montar.py`, `som/mixar.py`. Uma trilha diferente a cada 3 vídeos.

Cada vídeo novo é roteiro + lista de estações + capturas do app.

| Lote | Vídeos | Motivo |
|---|---|---|
| 1 | #2, #5, #9 | Mesma mesa, quase tudo pronto |
| 2 | #4, #3, #10 | Mesa, com capturas novas e conferência de dados |
| 3 | #6, #7, #8 | Formatos novos |

Paradas para o dono: os 3 vídeos de cada lote prontos. Voz e estilo já aprovados.

## Checagem antes de entregar cada vídeo

- Duração 20 a 25 s, H.264 + AAC, 1080x1920
- Um quadro por segundo revisado: texto na zona segura, nada sobreposto
- Transcrição da narração confere com o roteiro
- Todo número da arte igual ao print do app
- Nenhum travessão

## Limites conhecidos

- Cota gratuita do Gemini TTS: 3 pedidos por janela. Uma tomada por vídeo.
- Quem produz não ouve o áudio nem vê o vídeo rodando: volume, pronúncia e fluidez dependem da revisão do dono.
- Pixel da Meta, evento de cadastro e UTM continuam fora do app. Sem isso a campanha não otimiza para cadastro.
