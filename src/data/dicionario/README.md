# Dicionário Precificaí

Banco de dados pré-cadastrado de insumos, embalagens, preparos e produtos
para auto-preencher formulários sem dependência de IA em runtime.

## Estrutura

```
src/data/dicionario/
├── README.md                  ← este arquivo
├── index.js                   ← re-exporta tudo + função match()
├── insumos_universais.json    ← lácteos, ovos, gorduras, açúcares, farinhas, sal/pimenta
├── insumos_carnes.json        ← bovina, suína, aves, peixes, frutos do mar
├── insumos_vegetais.json      ← folhas, raízes, tubérculos, leguminosas
├── insumos_frutas.json        ← in natura + congeladas + polpas
├── insumos_temperos.json      ← especiarias, ervas, condimentos
├── insumos_confeitaria.json   ← chocolates, recheios, decoração, frutas em calda
├── insumos_lanchonete.json    ← embutidos, queijos amarelos, frios, molhos prontos
├── insumos_pizzaria.json      ← muçarela, calabresa, azeitona, oregano, massa pré-pronta
├── insumos_pastelaria.json    ← massas finas, recheios salgados específicos
├── insumos_padaria.json       ← fermentos, melhoradores, recheios doces
├── insumos_bebidas.json       ← refrigerantes, sucos, cervejas, café, chás, água
├── insumos_descartaveis.json  ← (cross-sell — descartáveis viram embalagens, não insumos)
├── embalagens.json            ← caixas, potes, sacos, sacolas, fitas, etiquetas
├── preparos_templates.json    ← recheios, massas, coberturas, caldas, molhos
└── produtos_templates.json    ← cardápios prontos por nicho
```

## Schema de cada entrada

```json
{
  "id": "ins_farinha_trigo_t1",          // slug único
  "nome_canonico": "Farinha de Trigo Tipo 1",
  "tokens": ["farinha","trigo","t1"],     // search tokens (lowercase, sem acento)
  "sinonimos": ["farinha branca"],        // variantes/regionalismos opcionais
  "categoria": "Farinhas",                // categoria principal
  "unidade_padrao": "g",                  // g | ml | un | kg | L
  "qtd_tipica_compra": 1000,              // quanto vem na embalagem padrão
  "icone": "grain",                       // ícone Feather/MaterialCommunity
  "nichos": ["padaria","confeitaria"]     // onde mais é usado (telemetria/UX)
}
```

## Como usar (em runtime)

```js
import { matchInsumo, matchEmbalagem } from '../data/dicionario';

const sugestao = matchInsumo("Farinha de trigo Dona Benta tipo 1");
// → { nome_canonico, categoria, unidade_padrao, qtd_tipica_compra, ... }
```

A função `matchInsumo()` faz token-matching fuzzy:
1. Normaliza o input (lowercase, remove acentos)
2. Quebra em tokens
3. Busca entry com maior overlap de tokens
4. Retorna a melhor se passar do threshold

## Como crescer

1. **Telemetria de miss**: quando user cadastra algo que não bate, salva em
   `feedback` ou tabela própria. Revisa periodicamente, expande JSON.
2. **Pull request manual**: qualquer dev pode adicionar entradas novas em
   PRs separados — fácil de revisar (só JSON).
3. **Lotes via Claude Code**: peça em sessão para gerar mais X itens da
   categoria Y; cole no JSON correspondente.

## Fontes públicas usadas

- **TACO** (USP/Unicamp) — alimentos brasileiros oficiais
- **Open Food Facts BR** — produtos com EAN
- Conhecimento de mercado curado para nichos de food service brasileiro
