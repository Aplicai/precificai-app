# Anúncio 01: tráfego pago (Meta Reels/Stories)

Design validado em brainstorm com o dono em 13/10/2026.

## Objetivo

Primeiro vídeo de venda do Precificaí para tráfego frio na Meta. Produzido inteiro por código (captura do app, animação, narração sintética). Segundo vídeo (tutorial YouTube 16:9) fica para depois e reaproveita as capturas.

## Decisões

| Tema | Decisão |
|---|---|
| Conversão | Criar conta grátis |
| Canal e formato | Meta Reels/Stories, 9:16, 1080x1920, 30 fps |
| Público | Todo estabelecimento de alimentação (lanchonete, hamburgueria, doceria, cafeteria) |
| Abordagem | Dor + comanda que desmonta o preço + tela real do app + CTA |
| Áudio | Narração Kokoro (voz escolhida pelo dono) + trilha com licença comercial |
| Duração | 20 a 22 segundos |
| Teste criativo | 1 corpo + 3 ganchos intercambiáveis |

## Estrutura

Corpo único (17s) precedido por um gancho (3s).

### Ganchos

- **A, número:** "Esse lanche de vinte e cinco reais deixa oitenta e sete centavos de lucro." Valor final vem da ficha real do produto.
- **B, Achômetro:** "Meu concorrente cobra vinte e cinco. Vou cobrar vinte e quatro." Tarja "O Achômetro ataca novamente".
- **C, pergunta:** "Quanto custa fazer o seu lanche? Se você chutou, está perdendo dinheiro."

### Corpo

| Trecho | Duração | Tela | Narração |
|---|---|---|---|
| Comanda | 5s | Comanda de papel, cada custo carimbado arranca um pedaço da nota de R$ 25 | "Tira os ingredientes. A embalagem. A taxa do aplicativo. A maquininha. O aluguel." |
| Resto | 1,5s | Pedaço que sobrou, tarja vermelha com o valor | "Sobrou isso." |
| App | 6s | Celular em colagem, tela real: ficha do produto, custo, preço sugerido | "O Precificaí faz essa conta por você e mostra o preço certo. Com o seu lucro dentro." |
| CTA | 4,5s | Logo, tarja "Crie sua conta grátis" | "Descubra o preço certo do seu lanche. Conta grátis, leva dois minutos. Toque em Cadastrar." |

Condições:

- "Leva dois minutos" só permanece se o cadastro cronometrado na captura confirmar.
- "Sem cartão" só entra se a tela de cadastro confirmar.
- Todo número na arte sai de um produto real cadastrado na conta de teste. Se o lucro a R$ 25 não for impactante, ajusta-se a receita, nunca o número na arte.

## Sistema visual

- Zona útil: 270 px a 1250 px na vertical, margens laterais de 65 px (interface do Reels cobre o resto).
- Fundos: verde petróleo `#004d47` na dor, cinza papel texturizado na solução. A troca marca a virada.
- Tipografia: DM Sans Black em caixa alta nos títulos, DM Sans Medium na legenda.
- Paleta de tarjas: `#e3b842` âmbar, `#e3704d` coral, `#265bb0` azul, `#6a4fb0` roxo, `#c74040` vermelho.
- Colagem feita em código: tarjas com borda rasgada (SVG), fita adesiva, contorno branco grosso nos recortes, textura de papel por ruído, sombra curta, inclinação de 2 a 4 graus.
- Movimento: elementos entram "colando" (escala 1,15 para 1 com leve rotação, 6 a 8 frames). Carimbos no tempo da trilha.
- Logo: `assets/logo-precificai.png` e `assets/logo-precificai-branca.png`.
- Fotos de comida: recortes do Canva da marca primeiro, depois Pexels ou Unsplash com licença comercial. Todo download passa por autorização.
- Regras de texto: nunca travessão, frases curtas, legenda sempre visível no meio da tela.

## Captura do app

- Playwright headless, viewport 390x844, escala 3x, vídeo nativo mais PNG.
- Conta de teste TE. Produto real "X-Burger" com ingredientes, embalagem e financeiro configurado. Permanece na conta para o tutorial.
- Telas: ficha do produto, composição de custo, preço sugerido, cadastro.

## Produção

Ferramentas: ffmpeg, espeak-ng, Python 3.11 isolado (Kokoro, faster-whisper), HyperFrames via npx (conferir comandos na documentação atual). Projeto em `video/anuncio-01/`, fora do bundle do app.

Paradas para aprovação do dono:

1. Números reais do X-Burger + roteiro final
2. Amostras das 3 vozes Kokoro (`pf_dora`, `pm_alex`, `pm_santa`)
3. Plano de cenas sincronizado com a fala (tempos do Whisper)
4. Preview antes do render final

Planos B:

- Pronúncia errada: grafia fonética só no texto do áudio. Voz robótica: Piper ou gravação do dono.
- HyperFrames falha: mesmo HTML e GSAP capturado quadro a quadro por Playwright e montado no ffmpeg.
- Trilha: entrega também versão sem trilha para usar a biblioteca de áudio da Meta.

## Checagem antes de entregar

- Duração até 22s, H.264 + AAC, 1080x1920
- Um quadro por segundo revisado: texto na zona segura, legível sem som
- Todo número da arte igual ao print do app
- Voz normalizada, trilha por baixo
- Nenhum travessão

## Entregas

- 3 MP4 (ganchos A, B, C), com e sem trilha
- 3 versões de texto principal e título para o Gerenciador de Anúncios
- Capturas do app guardadas para o tutorial

## Fora de escopo (tarefa separada, bloqueia a campanha)

O app não tem Pixel da Meta, evento de cadastro nem leitura de UTM. Sem isso a campanha não otimiza para cadastro. Implementar: Pixel + `CompleteRegistration` + evento de ativação (primeiro produto precificado) + captura de UTM. Depende do ID do Pixel e de aprovação do dono.

Funil alvo: anúncio, página de cadastro com a mesma frase do anúncio, cadastro, ativação, limite do plano grátis, remarketing para quem não ativou (Achômetro e case @apetite.lanches).

Métricas de corte: taxa de gancho acima de 30%, CTR acima de 1%, custo por cadastro. Campanha inicial: objetivo Cadastro, público aberto Brasil, R$ 30 a 50 por dia, 5 a 7 dias sem mexer.
