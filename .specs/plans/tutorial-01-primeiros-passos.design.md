# Tutorial 01: primeiros passos (YouTube, onboarding)

Design validado em brainstorm com o dono em 13/10/2026.

## Objetivo

Vídeo enviado ao cliente quando ele começa no Precificaí. Ao fim, ele tem o primeiro produto precificado e sabe onde fica cada coisa. Um segundo vídeo cobrirá cada aba em detalhe.

## Decisões

| Tema | Decisão |
|---|---|
| Formato | 16:9, 1920x1080, 4 a 5 min, capítulos do YouTube |
| Tela | Versão web no computador, tela cheia. Aviso: no celular o menu fica embaixo |
| Escopo | Do login ao primeiro produto. Cadastro da conta fica fora |
| Estilo | Tela real com zoom e destaques, abertura e cartelas de capítulo em colagem, checklist dos passos entre capítulos |
| Conta | Nova e vazia, criada pelo dono. Senha em `video/.env` (`TUTORIAL_SENHA`), nunca no chat |
| Voz | Gemini Fenrir, uma tomada por capítulo, marca como gravada (sem edição) |
| Som | Trilha calma e baixa, legenda sempre visível |
| Texto | Tom de conversa, "você", frases curtas, nunca travessão, jargão sempre explicado |
| Números | Só os que aparecem na tela gravada |

## Capítulos

| # | Capítulo | Conteúdo | Tempo |
|---|---|---|---|
| 0 | Abertura | Promessa e checklist dos 5 passos | 15 s |
| 1 | Conhecendo a tela | Menu lateral, as 6 áreas, uma frase para cada | 45 s |
| 2 | Kit de Início | O que é, como escolher o modelo do negócio | 35 s |
| 3 | Suas contas do mês | Configuração financeira e por que vem primeiro | 60 s |
| 4 | Primeiro ingrediente | Nome, preço pago, quantidade. Custo por unidade calculado | 45 s |
| 5 | Primeiro produto | Monta o lanche, custo, preço sugerido, lucro | 60 s |
| 6 | E agora? | Receitas base, embalagens e ferramentas citadas. Próximo vídeo. Suporte | 20 s |

Ordem de preenchimento ensinada: contas do mês, ingredientes, receitas base (se tiver), embalagens (se tiver), produtos. Conferir com o app antes de fechar o roteiro.

## Produção

- Captura: Playwright 1920x1080 contra o app local (`e2e-web`), telas reais e posição dos campos.
- Montagem: HyperFrames em `video/tutorial-01/`, reaproveitando o molde dos anúncios. Peças novas: moldura de navegador, zoom no campo, anel de destaque, cursor, cartela de capítulo, checklist.
- Voz: `molde/gemini_tts.py`, 7 tomadas.
- Entrega: Drive `03_PRECIFICAÍ/Vídeos - Tutoriais`, master + leve, título, descrição com capítulos e sugestão de capa.

## Paradas para o dono

1. Roteiro escrito, antes de gravar a voz.
2. Vídeo pronto.

## Checagem

- Transcrição da narração confere com o roteiro.
- Um quadro a cada 2 s revisado: legível, nada sobreposto.
- Todo número da arte igual ao da tela.
- Nenhum travessão.

## Limites

- Quem produz não ouve o áudio nem vê o vídeo rodando: volume, pronúncia e ritmo dependem da revisão do dono.
- Criação da conta e digitação de senha ficam com o dono.
