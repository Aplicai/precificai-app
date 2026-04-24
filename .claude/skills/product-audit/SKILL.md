---
name: product-audit
description: Rotina de auditoria de produto Precificaí — usabilidade, design, segurança, aderência a mercado, simplificação. Use ao iniciar análise de fluxo, ao avaliar tela, ao receber feedback de usuário, ou periodicamente como pulse-check.
---

# Product Audit Skill — Precificaí

## Propósito

Padronizar a rotina de auditoria e evolução do produto. Reusável em toda nova sessão. Garante que cada análise produza diagnóstico → decisão → execução → registro.

## Quando invocar

- Ao iniciar análise de qualquer fluxo (login, cadastro, ficha técnica, vendas, estoque, etc.)
- Ao receber feedback de usuário (screenshot, bug, atrito relatado)
- Periodicamente como pulse-check de qualidade
- Antes de release ou deploy significativo
- Sempre antes de adicionar feature nova (validar se não há simplificação melhor)

## Inputs esperados

- Nome do fluxo / tela / componente alvo
- (Opcional) screenshot, gravação, descrição de atrito, bug

## Etapas

### 1. Contexto

- Ler `.memory-bank/activeContext.md` e `WORKLOG.md`
- Localizar arquivos da tela alvo (`src/screens/`, componentes em `src/components/`)
- Mapear rota no `AppNavigator.js` (saber onde se encaixa)

### 2. Diagnóstico (15 perguntas)

Para cada fluxo / tela / interação:

#### Usabilidade
1. O usuário entende isso sem precisar estudar?
2. O número de passos é o mínimo possível?
3. Há risco de erro humano (campo confuso, clique acidental, perda de dado)?
4. Funciona para o público leigo (dono de padaria sem TI)?
5. Tarefas recorrentes são rápidas?

#### Design
6. Hierarquia visual clara? CTA primária se destaca?
7. Densidade adequada? Escaneabilidade?
8. Estados (vazio, carregando, erro, sucesso) cobertos?
9. Consistência visual com o resto do app?
10. Responsividade em mobile + desktop OK?

#### Segurança / negócio
11. Validações no front + back? Sem confiança excessiva no cliente?
12. Mensagens de erro úteis sem expor stack/SQL?
13. Cálculos financeiros corretos e sem dupla-divisão / overflow?
14. Risco de perder dado (delete sem undo, save mal sinalizado)?

#### Aderência a mercado
15. Compatível com padrões SaaS B2B SMB observados em `MARKET_BENCHMARK.md`?

### 3. Classificação

Para cada problema encontrado, classifique:

| Severidade | Critério |
|------------|----------|
| **P0 — bloqueante** | Crash, perda de dado, vulnerabilidade de segurança, cálculo financeiro errado |
| **P1 — atrito alto** | Erro frequente, fluxo confuso, abandono, retrabalho |
| **P2 — quick win** | Melhoria fácil de alto retorno (microcopy, ícone, ordem de campo) |
| **P3 — diferenciação** | Oportunidade competitiva vs mercado |

### 4. Decisão

Para cada item, classifique a função/componente em:

1. Manter como está
2. Manter, mas reposicionar
3. Simplificar drasticamente
4. Integrar a outro fluxo
5. Transformar em algo secundário
6. Remover do produto

**Regra de ouro:** se a função aumenta complexidade sem entregar valor proporcional, **propor remoção**.

### 5. Execução

Quando o caminho estiver claro e seguro:

- Implementar a mudança
- Testar fluxo (mental ou via Playwright se disponível)
- Validar em mobile + desktop quando aplicável
- Não quebrar fluxos adjacentes

**Confirmação obrigatória apenas para:**

1. Apagar dados importantes (DROP, DELETE em massa)
2. Mudança irreversível de arquitetura (refactor de schema, mudança de framework)
3. Alterar regra de negócio crítica (markup, custo médio, validação fiscal) sem evidência clara
4. Ação destrutiva fora do escopo (push --force, reset hard)

Fora isso: **executar sem pedir.**

### 6. Registro

Ao concluir:

- Atualizar `WORKLOG.md` (status do item, decisão, evidência)
- Atualizar `.memory-bank/activeContext.md` (estado mais recente da sessão)
- Atualizar `.memory-bank/progress.md` (o que foi entregue nesta iteração)
- Se decisão for duradoura: atualizar `CLAUDE.md` (gotcha, padrão, convenção)
- Se referência de mercado nova: atualizar `MARKET_BENCHMARK.md`
- Se padrão técnico novo: atualizar `.memory-bank/systemPatterns.md` ou `techContext.md`

## Output esperado

Ao terminar a auditoria de um item, produzir resumo curto contendo:

```
## <Nome do fluxo/tela>

**Diagnóstico:** <2-4 linhas — o que está bom, o que está ruim>

**Decisão:** <classificação 1-6 + uma frase de justificativa>

**Implementado nesta sessão:**
- <mudança 1>
- <mudança 2>

**Pendente para próxima iteração:**
- <item P2/P3>

**Evidências / referências:**
- <arquivo:linha>
- <ref de mercado se aplicável>
```

## Anti-padrões a vigiar

- Adicionar feature nova quando o problema é falta de descoberta (resolver com microcopy/posicionamento, não com mais código)
- Confiar que "tá funcionando, deixa quieto" — usabilidade ruim que sobrevive vira dívida
- Pedir confirmação para microdecisões que estão claramente no escopo
- Não documentar a decisão (próxima sessão pergunta de novo)
- Copiar padrão de SaaS enterprise sem adaptar para SMB de alimentação
