// Régua semanal: catálogo de temas × formatos e a escolha do próximo e-mail.
// Desenho: .specs/plans/email-regua.design.md. Puro (sem Deno/rede): roda no Node
// para testes (__tests__/emailRegua.test.mjs) e para a prévia (scripts/email-previa.ts).
//
// Regras do texto: "você", verbos no imperativo, nunca travessão, nenhum número
// inventado (só os da conta da pessoa ou contas de exemplo que fecham).

import {
  APP, esc, htmlChecklist, htmlDica, htmlExemplo, htmlJornada, htmlLista, htmlMito, htmlNumeros,
  htmlPreco, htmlVideo, moldura, par,
} from './layout.ts';
import type { Estagio, Formato } from './layout.ts';

// ---------- tipos ----------

export type Padrao = 'pergunta' | 'numero' | 'nome' | 'curiosidade';
export type Fase = 'semanal' | 'quinzenal' | 'mensal';

/** Dados da conta (public.email_dados). Tudo opcional: faltou, o texto se vira sem. */
export interface Dados {
  negocio?: string | null;
  segmento?: string | null;
  insumos?: number;
  insumos_com_preco?: number;
  produtos?: number;
  produtos_com_preco?: number;
  produto_foco?: { nome: string; ingredientes: number; ingredientes_sem_preco: number; exemplos: string[] } | null;
  insumos_recentes?: string[];
  produtos_sem_preco?: string[];
  ultimo_produto?: { nome: string; preco: number } | null;
  dias_sem_atualizar_precos?: number | null;
}

/** Linha de public.email_regua_candidatos. */
export interface Candidato {
  estagio: Estagio;
  plano: string;
  fase: Fase;
  temas_recebidos: string[];
  formatos_recentes: string[];   // mais recente primeiro (até 3)
  padroes_recentes: string[];    // mais recente primeiro (até 3)
}

interface Conteudo {
  assunto: string;
  previa: string;
  selo?: string;
  titulo: string;
  corpo: string;   // HTML
  cta: string;
}

interface Variante {
  formato: Formato;
  padrao: Padrao;
  /** false = faltam dados para esta versão; a escolha tenta a outra. */
  requer?: (d: Dados) => boolean;
  montar: (d: Dados, link: string) => Conteudo;
}

interface Tema {
  id: string;
  /** Etapas que recebem o tema; 'mensal' = novidades (depois do dia 90 ou quando a etapa acabou). */
  para: Estagio[] | 'mensal';
  soGratis?: boolean;
  variantes: [Variante, Variante];
}

// ---------- ajudantes ----------

const VIDEOS = {
  t1: { url: 'https://youtu.be/qG2BFhvEFkU', titulo: 'Do cadastro ao preço certo do seu produto', dur: '5 min' },
  t2: { url: 'https://youtu.be/KqJk_oWhi5s', titulo: 'Ingredientes com perda e preço por quilo', dur: '4 min' },
  t3: { url: 'https://youtu.be/j9C082LEmVg', titulo: 'Receitas base com custo por quilo', dur: '5 min' },
  t4: { url: 'https://youtu.be/ZH3T_8xjhdY', titulo: 'Custo de embalagens por unidade', dur: '4 min' },
};
const video = (v: keyof typeof VIDEOS) => htmlVideo(VIDEOS[v].url, VIDEOS[v].titulo, VIDEOS[v].dur);

/** Nome digitado pela pessoa: cortado em 40 caracteres e escapado. */
export function nome(s: string | null | undefined): string {
  const t = (s || '').trim().replace(/\s+/g, ' ');
  return esc(t.length > 40 ? `${t.slice(0, 39).trimEnd()}…` : t);
}
/** Mesmo corte, sem escapar (assunto e prévia são escapados na moldura). */
function nomeCru(s: string | null | undefined): string {
  const t = (s || '').trim().replace(/\s+/g, ' ');
  return t.length > 40 ? `${t.slice(0, 39).trimEnd()}…` : t;
}
/** ["a","b","c"] → "a, b e c" (escapado, em negrito). */
function lista(nomes: string[] | undefined): string {
  const n = (nomes || []).filter((x) => x && x.trim()).map((x) => `<b>${nome(x)}</b>`);
  return n.length <= 1 ? (n[0] || '') : `${n.slice(0, -1).join(', ')} e ${n[n.length - 1]}`;
}
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
const temNegocio = (d: Dados) => !!(d.negocio && d.negocio.trim());
const ola = (d: Dados) => par(temNegocio(d) ? `Olá, ${nome(d.negocio)}!` : 'Olá!');
const reais = (v: number) => `R$ ${v.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;

const SELO: Record<Formato, string> = {
  passo: 'Dica do Precificaí', painel: 'Seus números', tela: 'Passo a passo', carta: '', mito: 'Mito ou verdade', checklist: 'Seu checklist',
};
const PASSO: Record<Estagio, number> = {
  sem_perfil: 0, sem_ingrediente: 1, kit_sem_preco: 1, sem_produto: 2, produto_sem_preco: 3, ativo: 4,
};

// ---------- catálogo ----------

export const TEMAS: Tema[] = [
  // ===== sem perfil =====
  {
    id: 'custo-real',
    para: ['sem_perfil'],
    variantes: [
      {
        formato: 'mito', padrao: 'curiosidade',
        montar: () => ({
          assunto: 'O erro de preço mais comum de quem vende comida',
          previa: 'O dobro do ingrediente nem sempre dá lucro. Veja por quê.',
          titulo: 'O dobro do custo é lucro?',
          corpo: [
            htmlMito('Se o ingrediente custou R$ 10, cobrar R$ 20 dá lucro.',
              'Embalagem, gás, perda e as contas do mês também entram no custo. Sem elas, o dobro pode virar prejuízo.'),
            par('O Precificaí junta tudo isso e mostra o preço certo do seu produto. O primeiro passo leva 1 minuto: conte o nome do seu negócio.'),
          ].join(''),
          cta: 'Começar agora',
        }),
      },
      {
        formato: 'carta', padrao: 'pergunta',
        montar: () => ({
          assunto: 'Quanto custa de verdade o que você vende?',
          previa: 'Não é só o ingrediente. Dá para descobrir em poucos minutos.',
          titulo: 'Quanto custa de verdade o que você vende?',
          corpo: [
            par('Olá!'),
            par('Quando a gente pergunta quanto custa um produto, a resposta quase sempre é o preço dos ingredientes. Mas o custo de verdade inclui a embalagem, o que se perde no preparo e um pedaço do aluguel, da luz e do gás.'),
            par('Foi para isso que criamos o Precificaí: você conta o que compra e o app faz a conta inteira.'),
            par('Você já tem conta. Falta só contar o nome do seu negócio para o app abrir pronto para você.'),
          ].join(''),
          cta: 'Continuar de onde parei',
        }),
      },
    ],
  },
  {
    id: 'preco-concorrencia',
    para: ['sem_perfil'],
    variantes: [
      {
        formato: 'mito', padrao: 'pergunta',
        montar: () => ({
          assunto: 'Você cobra o mesmo preço da concorrência?',
          previa: 'O custo dela não é o seu. Veja o que muda.',
          titulo: 'Copiar o preço do concorrente funciona?',
          corpo: [
            htmlMito('Se o concorrente cobra R$ 8, eu também posso cobrar R$ 8.',
              'O custo dele não é o seu. Fornecedor, receita, aluguel e quanto você vende mudam de um negócio para outro.'),
            par('Descubra o <b>seu</b> preço, com os <b>seus</b> custos. Comece contando o nome do seu negócio.'),
          ].join(''),
          cta: 'Descobrir meu preço',
        }),
      },
      {
        formato: 'checklist', padrao: 'numero',
        montar: () => ({
          assunto: '4 passos para saber o seu preço (o 1º leva 1 minuto)',
          previa: 'Seu negócio, ingredientes, produto e preço. Comece pelo primeiro.',
          titulo: '4 passos até o seu preço',
          corpo: [
            ola({}),
            par('Do cadastro ao preço certo são só estes passos:'),
            htmlChecklist([
              { feito: true, texto: 'Criar sua conta' },
              { feito: false, texto: 'Contar o nome e o tipo do seu negócio' },
              { feito: false, texto: 'Colocar o preço que você paga nos ingredientes' },
              { feito: false, texto: 'Montar o produto e ver o preço sugerido' },
            ]),
          ].join(''),
          cta: 'Fazer o próximo passo',
        }),
      },
    ],
  },
  {
    id: 'kit-segmento',
    para: ['sem_perfil'],
    variantes: [
      {
        formato: 'passo', padrao: 'curiosidade',
        montar: () => ({
          assunto: 'Seus ingredientes já podem chegar prontos',
          previa: 'Escolha o tipo do seu negócio e o app traz os ingredientes mais comuns.',
          selo: 'Passo 1 de 4',
          titulo: 'Não comece do zero',
          corpo: [
            htmlJornada(0),
            ola({}),
            par('Ao contar o nome e o tipo do seu negócio, você pode pegar o <b>Kit de Início</b>: os ingredientes mais comuns do seu ramo já cadastrados.'),
            htmlDica('Depois é só colocar o preço que você paga em cada um. Nada de digitar a lista inteira.'),
          ].join(''),
          cta: 'Escolher meu tipo de negócio',
        }),
      },
      {
        formato: 'carta', padrao: 'pergunta',
        montar: () => ({
          assunto: 'Doce, salgado, marmita ou pizza?',
          previa: 'Conte o que você vende e o Precificaí começa pronto.',
          titulo: 'Doce, salgado, marmita ou pizza?',
          corpo: [
            par('Olá!'),
            par('Cada negócio de comida tem seus ingredientes de sempre. Por isso o Precificaí pergunta o que você vende antes de tudo.'),
            par('Com essa resposta, o app pode trazer os ingredientes mais comuns do seu ramo já cadastrados. Você só coloca o preço que paga.'),
            par('Leva 1 minuto.'),
          ].join(''),
          cta: 'Contar o que eu vendo',
        }),
      },
    ],
  },

  // ===== ingredientes (sem ingrediente / kit sem preço) =====
  {
    id: 'como-voce-compra',
    para: ['sem_ingrediente', 'kit_sem_preco'],
    variantes: [
      {
        formato: 'passo', padrao: 'curiosidade',
        montar: (d) => ({
          assunto: 'Cadastre ingrediente sem fazer conta',
          previa: 'Escreva do jeito que você compra: "Comprei 5 kg por R$ 25".',
          selo: 'Passo 2 de 4',
          titulo: 'Escreva do jeito que você compra',
          corpo: [
            htmlJornada(1),
            ola(d),
            par('No Precificaí, ingrediente se cadastra em uma frase, sem calculadora:'),
            htmlExemplo({
              frase: 'Comprei <b>5 kg</b> de farinha por <b>R$ 25,00</b>',
              resultado: 'O app calcula sozinho: R$ 5,00 o kg, ou R$ 0,50 a cada 100 g.',
            }),
            video('t2'),
          ].join(''),
          cta: 'Cadastrar um ingrediente',
        }),
      },
      {
        formato: 'carta', padrao: 'pergunta',
        montar: (d) => ({
          assunto: 'Lembra quanto pagou na última compra?',
          previa: 'É só disso que o Precificaí precisa para começar.',
          titulo: 'Lembra quanto pagou na última compra?',
          corpo: [
            ola(d),
            par('Para o Precificaí calcular o seu preço, ele só precisa saber o que você já sabe: quanto pagou e quanto veio.'),
            par('Pegue a nota da última compra (ou a memória mesmo) e escreva: <b>"Comprei 2 kg por R$ 18"</b>. O app transforma isso em preço por quilo e por grama.'),
            par('Comece pelo ingrediente que mais pesa no que você vende.'),
          ].join(''),
          cta: 'Colocar meus preços',
        }),
      },
    ],
  },
  {
    id: 'produto-foco',
    para: ['kit_sem_preco'],
    variantes: [
      {
        formato: 'painel', padrao: 'numero',
        requer: (d) => (d.insumos ?? 0) > 0,
        montar: (d) => {
          const f = d.produto_foco;
          const semPreco = (d.insumos ?? 0) - (d.insumos_com_preco ?? 0);
          return {
            assunto: `${plural(semPreco, 'ingrediente esperando', 'ingredientes esperando')} o seu preço`,
            previa: f ? `Comece pelo ${nomeCru(f.nome)}: o preço sugerido aparece quando os ingredientes dele têm preço.` : 'Coloque o preço que você paga e o preço sugerido aparece.',
            titulo: 'Seus ingredientes estão quase prontos',
            corpo: [
              htmlNumeros([
                { valor: String(d.insumos ?? 0), rotulo: 'ingredientes no app' },
                { valor: String(semPreco), rotulo: 'ainda sem preço', destaque: true },
              ]),
              f && f.ingredientes > 0
                ? par(`Comece pelo <b>${nome(f.nome)}</b>. Ele usa ${plural(f.ingredientes, 'ingrediente', 'ingredientes')}${f.exemplos?.length ? `, como ${lista(f.exemplos)}` : ''}. Com o preço deles, o preço sugerido aparece.`)
                : par('Comece pelos ingredientes do produto que você mais vende. Com o preço deles, o preço sugerido aparece.'),
            ].join(''),
            cta: 'Colocar meus preços',
          };
        },
      },
      {
        formato: 'checklist', padrao: 'nome',
        requer: (d) => temNegocio(d) && !!d.produto_foco?.nome,
        montar: (d) => {
          const f = d.produto_foco!;
          return {
            assunto: `${nomeCru(d.negocio)}, falta pouco para o preço do ${nomeCru(f.nome)}`,
            previa: 'Veja o que já está feito e o que falta.',
            titulo: `O preço do ${nomeCru(f.nome)}`,
            corpo: [
              ola(d),
              htmlChecklist([
                { feito: true, texto: 'Seu negócio cadastrado' },
                { feito: true, texto: `${plural(d.insumos ?? 0, 'ingrediente', 'ingredientes')} no app` },
                { feito: false, texto: f.exemplos?.length ? `Preço em ${lista(f.exemplos)}` : `Preço nos ingredientes do <b>${nome(f.nome)}</b>` },
                { feito: false, texto: `Ver o preço sugerido do <b>${nome(f.nome)}</b>` },
              ]),
              htmlDica('Use o preço que você pagou na última compra. Dá para trocar depois.'),
            ].join(''),
            cta: 'Terminar meu checklist',
          };
        },
      },
    ],
  },
  {
    id: 'perda',
    para: ['sem_ingrediente', 'kit_sem_preco'],
    variantes: [
      {
        formato: 'mito', padrao: 'curiosidade',
        montar: () => ({
          assunto: 'Casca, osso e aparas também custam',
          previa: 'O quilo que vai para a receita custa mais do que o quilo que você comprou.',
          titulo: 'O quilo comprado é o quilo usado?',
          corpo: [
            htmlMito('Paguei R$ 10 no quilo, então custa R$ 10 o quilo.',
              'Se 20% vira casca ou aparas, o quilo que vai para a receita custa <b>R$ 12,50</b>.'),
            par('No Precificaí, toque em <b>Tem perda?</b> ao cadastrar o ingrediente e informe quanto sobra limpo. O app faz a conta.'),
            video('t2'),
          ].join(''),
          cta: 'Cadastrar com perda',
        }),
      },
      {
        formato: 'passo', padrao: 'pergunta',
        montar: (d) => ({
          assunto: 'Você desconta a casca no preço?',
          previa: '1 kg comprado, 600 g limpo: veja quanto custa de verdade.',
          selo: 'Passo 2 de 4',
          titulo: 'Você desconta a casca no preço?',
          corpo: [
            htmlJornada(1),
            ola(d),
            par('Fruta, carne e legumes perdem peso no preparo. O Precificaí calcula o preço do que sobra:'),
            htmlExemplo({
              frase: 'Comprei <b>1 kg</b> de abacaxi por <b>R$ 8,00</b> e sobram <b>600 g</b> limpos',
              resultado: 'O quilo limpo sai R$ 13,33. É esse valor que entra na receita.',
            }),
            video('t2'),
          ].join(''),
          cta: 'Cadastrar um ingrediente',
        }),
      },
    ],
  },
  {
    id: 'embalagem',
    para: ['sem_ingrediente', 'kit_sem_preco'],
    variantes: [
      {
        formato: 'carta', padrao: 'pergunta',
        montar: (d) => ({
          assunto: 'A caixa entra no seu preço?',
          previa: 'Pote, caixa, fita e etiqueta também são custo.',
          titulo: 'A caixa entra no seu preço?',
          corpo: [
            ola(d),
            par('Muita gente calcula o recheio, a massa, o molho, e esquece o que vai por fora: o pote, a caixa, o saquinho, a fita, a etiqueta.'),
            par('No Precificaí, a embalagem tem lugar próprio. Você cadastra o pacote que comprou (por exemplo, 50 caixas por R$ 40) e o app calcula quanto custa cada uma dentro do produto.'),
            video('t4'),
          ].join(''),
          cta: 'Ver minhas embalagens',
        }),
      },
      {
        formato: 'checklist', padrao: 'numero',
        montar: (d) => ({
          assunto: '3 custos que quase todo mundo esquece',
          previa: 'Embalagem, perda e as contas do mês. O Precificaí tem lugar para os 3.',
          titulo: '3 custos que ficam de fora',
          corpo: [
            ola(d),
            par('Confira se estes entram no seu preço:'),
            htmlChecklist([
              { feito: false, texto: '<b>Embalagem:</b> caixa, pote, fita, etiqueta' },
              { feito: false, texto: '<b>Perda:</b> casca, aparas, o que fica na forma' },
              { feito: false, texto: '<b>Contas do mês:</b> aluguel, luz, gás, internet' },
            ]),
            par('O Precificaí tem lugar para os 3. Comece pelos ingredientes e o resto vem junto.'),
          ].join(''),
          cta: 'Começar pelos ingredientes',
        }),
      },
    ],
  },

  // ===== produto (sem produto / produto sem preço) =====
  {
    id: 'usar-sugerido',
    para: ['sem_produto', 'produto_sem_preco'],
    variantes: [
      {
        formato: 'painel', padrao: 'numero',
        requer: (d) => (d.produtos_sem_preco?.length ?? 0) > 0,
        montar: (d) => {
          const n = Math.max(d.produtos_sem_preco!.length, (d.produtos ?? 0) - (d.produtos_com_preco ?? 0));
          return {
            assunto: `${plural(n, 'produto esperando', 'produtos esperando')} um preço`,
            previa: 'Um toque em "Usar sugerido" e o preço aparece.',
            titulo: 'Seus produtos estão quase prontos',
            corpo: [
              htmlNumeros([
                { valor: String(d.insumos_com_preco ?? 0), rotulo: 'ingredientes com preço' },
                { valor: String(n), rotulo: n === 1 ? 'produto sem preço' : 'produtos sem preço', destaque: true },
              ]),
              par(`Abra ${lista(d.produtos_sem_preco)} e toque em <b>Usar sugerido</b>. O preço sai calculado com o seu custo.`),
            ].join(''),
            cta: 'Ver meus produtos',
          };
        },
      },
      {
        formato: 'passo', padrao: 'pergunta',
        montar: (d) => ({
          assunto: 'Não sabe quanto cobrar? O app sugere',
          previa: 'O preço sugerido usa o seu custo e o lucro que você quer.',
          selo: 'Passo 4 de 4',
          titulo: 'Não sabe quanto cobrar?',
          corpo: [
            htmlJornada(3),
            ola(d),
            par('Ao montar o produto, o Precificaí soma o custo dos ingredientes e da embalagem e mostra um <b>preço sugerido</b>.'),
            htmlLista(['Escolha os ingredientes e quanto vai de cada um.', 'Diga quanto a receita rende.', 'Toque em <b>Usar sugerido</b>.'], true),
            htmlDica('O sugerido aparece zerado? Os ingredientes ainda estão sem o preço que você paga. Coloque o preço em alguns e ele aparece.'),
          ].join(''),
          cta: 'Montar meu produto',
        }),
      },
    ],
  },
  {
    id: 'receita-base',
    para: ['sem_produto', 'produto_sem_preco'],
    variantes: [
      {
        formato: 'passo', padrao: 'curiosidade',
        montar: (d) => ({
          assunto: 'Recheio, massa ou molho: cadastre uma vez só',
          previa: 'Use a mesma receita base em quantos produtos quiser.',
          titulo: 'Cadastre uma vez, use em tudo',
          corpo: [
            ola(d),
            par('Se o mesmo recheio, massa ou molho vai em vários produtos, cadastre como <b>receita base</b>. O app calcula o custo por quilo e você usa em quantos produtos quiser.'),
            htmlDica('Mudou o preço de um ingrediente da receita base? Todos os produtos que usam a receita se atualizam juntos.'),
            video('t3'),
          ].join(''),
          cta: 'Criar uma receita base',
        }),
      },
      {
        formato: 'mito', padrao: 'pergunta',
        montar: () => ({
          assunto: 'Você cadastra o mesmo recheio várias vezes?',
          previa: 'Não precisa. Veja como a receita base resolve.',
          titulo: 'Toda receita do zero?',
          corpo: [
            htmlMito('Cada produto precisa da receita inteira cadastrada de novo.',
              'Cadastre o recheio ou a massa como <b>receita base</b> uma vez e use em quantos produtos quiser.'),
            par('Quando um ingrediente sobe, o custo de todos os produtos que usam a receita muda junto.'),
            video('t3'),
          ].join(''),
          cta: 'Ver receitas base',
        }),
      },
    ],
  },
  {
    id: 'financeiro',
    para: ['sem_produto', 'produto_sem_preco'],
    variantes: [
      {
        formato: 'carta', padrao: 'pergunta',
        montar: (d) => ({
          assunto: 'Seu preço paga o aluguel?',
          previa: 'Duas perguntas no Financeiro colocam as contas do mês no seu preço.',
          titulo: 'Seu preço paga o aluguel?',
          corpo: [
            ola(d),
            par('O preço certo cobre os ingredientes e também um pedaço do aluguel, da luz, do gás e do seu salário.'),
            par('No Precificaí, isso fica no <b>Financeiro</b>, em duas perguntas: quanto você quer ganhar e quanto vende por mês. O preço sugerido de todos os produtos passa a considerar isso.'),
          ].join(''),
          cta: 'Abrir o Financeiro',
        }),
      },
      {
        formato: 'checklist', padrao: 'nome',
        requer: temNegocio,
        montar: (d) => ({
          assunto: `${nomeCru(d.negocio)}: o que entra no seu preço`,
          previa: 'Veja o que já está no app e o que falta conferir.',
          titulo: 'O que entra no seu preço',
          corpo: [
            ola(d),
            htmlChecklist([
              { feito: (d.insumos_com_preco ?? 0) > 0, texto: 'Ingredientes com o preço que você paga' },
              { feito: (d.produtos ?? 0) > 0, texto: 'Produto montado com a receita' },
              { feito: false, texto: 'Conferir as contas do mês no <b>Financeiro</b>' },
              { feito: false, texto: 'Dizer quanto você quer ganhar' },
            ]),
            htmlDica('Com o Financeiro preenchido, o preço sugerido já inclui o aluguel, a luz e o seu lucro.'),
          ].join(''),
          cta: 'Conferir meu Financeiro',
        }),
      },
    ],
  },

  // ===== ativo =====
  {
    id: 'atualizar-precos',
    para: ['ativo'],
    variantes: [
      {
        formato: 'painel', padrao: 'numero',
        requer: (d) => (d.dias_sem_atualizar_precos ?? 0) >= 30,
        montar: (d) => ({
          assunto: `Seus preços de ingrediente têm ${d.dias_sem_atualizar_precos} dias`,
          previa: 'O fornecedor mudou o preço? Atualize e veja o seu produto na hora.',
          titulo: 'Seus preços estão em dia?',
          corpo: [
            htmlNumeros([
              { valor: String(d.dias_sem_atualizar_precos), rotulo: 'dias sem atualizar ingredientes', destaque: true },
              { valor: String(d.produtos_com_preco ?? 0), rotulo: (d.produtos_com_preco ?? 0) === 1 ? 'produto com preço' : 'produtos com preço' },
            ]),
            par('Se algum ingrediente subiu, o custo dos seus produtos subiu junto. Abra <b>Mais &rsaquo; Atualizar Preços</b>, troque o valor e veja na hora o novo custo e o novo sugerido.'),
          ].join(''),
          cta: 'Atualizar meus preços',
        }),
      },
      {
        formato: 'mito', padrao: 'pergunta',
        montar: () => ({
          assunto: 'O fornecedor aumentou. E o seu preço?',
          previa: 'Quando o ingrediente sobe, a sua sobra cai. Veja como conferir.',
          titulo: 'Calculou uma vez, acabou?',
          corpo: [
            htmlMito('Calculei o preço uma vez, está resolvido.',
              'Quando um ingrediente sobe, o custo do produto sobe junto e a sua sobra diminui.'),
            par('Em <b>Mais &rsaquo; Atualizar Preços</b> você troca o valor dos ingredientes numa tela só e o app recalcula todos os produtos.'),
          ].join(''),
          cta: 'Atualizar meus preços',
        }),
      },
    ],
  },
  {
    id: 'mais-lucro',
    para: ['ativo'],
    variantes: [
      {
        formato: 'passo', padrao: 'pergunta',
        montar: (d) => ({
          assunto: 'Qual produto dá mais lucro para você?',
          previa: 'Ordene seus produtos pela margem e descubra.',
          selo: 'Primeiro preço feito',
          titulo: 'Qual produto dá mais lucro?',
          corpo: [
            htmlJornada(4),
            ola(d),
            par('Nem sempre o produto que mais vende é o que mais deixa dinheiro. Para descobrir:'),
            htmlLista(['Abra <b>Produtos</b>.', 'Ordene por <b>Menor margem</b>.', 'Os primeiros da lista são os que pedem um preço novo.'], true),
          ].join(''),
          cta: 'Ver meus produtos',
        }),
      },
      {
        formato: 'carta', padrao: 'nome',
        requer: (d) => temNegocio(d) && !!d.ultimo_produto?.nome,
        montar: (d) => ({
          assunto: `${nomeCru(d.negocio)}, qual produto paga as contas?`,
          previa: 'Uma olhada na margem de cada produto responde.',
          titulo: 'Qual produto paga as contas?',
          corpo: [
            ola(d),
            par(`Você já tem preço no <b>${nome(d.ultimo_produto!.nome)}</b>${d.ultimo_produto!.preco > 0 ? ` (${reais(d.ultimo_produto!.preco)})` : ''}. Agora vale olhar o conjunto: qual produto deixa mais dinheiro e qual quase não deixa nada?`),
            par('Em <b>Produtos</b>, ordene por <b>Menor margem</b>. O que aparecer no topo merece um preço novo ou uma receita revista.'),
          ].join(''),
          cta: 'Ver minhas margens',
        }),
      },
    ],
  },
  {
    id: 'pro-delivery',
    para: ['ativo'],
    soGratis: true,
    variantes: [
      {
        formato: 'passo', padrao: 'pergunta',
        montar: (d) => ({
          assunto: 'Quanto cobrar no iFood sem perder lucro?',
          previa: 'O Pro calcula o preço de cada aplicativo, já com a comissão.',
          selo: 'Plano Pro',
          titulo: 'Quanto cobrar no iFood?',
          corpo: [
            ola(d),
            par('No aplicativo, a comissão sai do seu preço. No Pro, o Precificaí calcula o preço certo para cada aplicativo e libera tudo:'),
            htmlLista([
              'Produtos e combos <b>ilimitados</b> (no Grátis são 5 de cada).',
              '<b>Delivery</b> com o preço de cada aplicativo, já com a comissão.',
              '<b>Lista de Compras</b>, <b>Relatórios</b> e fichas em PDF.',
            ], false),
            htmlPreco(),
          ].join(''),
          cta: 'Ver o Pro com os meus dados',
        }),
      },
      {
        formato: 'painel', padrao: 'numero',
        montar: (d) => ({
          assunto: '5 produtos é pouco? Veja o que o Pro libera',
          previa: 'Produtos ilimitados, delivery e lista de compras.',
          titulo: 'Seu cardápio cabe no Grátis?',
          corpo: [
            htmlNumeros([
              { valor: String(d.produtos ?? 0), rotulo: 'produtos seus hoje' },
              { valor: '5', rotulo: 'limite do Grátis', destaque: true },
            ]),
            par('No Pro, produtos e combos são <b>ilimitados</b> e você ganha o Delivery com o preço de cada aplicativo, a Lista de Compras e os Relatórios.'),
            htmlPreco(),
          ].join(''),
          cta: 'Ver o Pro',
        }),
      },
    ],
  },
  {
    id: 'mais-vendidos',
    para: ['ativo'],
    variantes: [
      {
        formato: 'painel', padrao: 'numero',
        requer: (d) => (d.produtos_com_preco ?? 0) > 0 && (d.produtos_com_preco ?? 0) < 5,
        montar: (d) => ({
          assunto: `Você tem ${plural(d.produtos_com_preco!, 'produto', 'produtos')} com preço. E os outros?`,
          previa: 'Cadastre os que você mais vende primeiro.',
          titulo: 'E os outros produtos?',
          corpo: [
            htmlNumeros([
              { valor: String(d.produtos_com_preco), rotulo: d.produtos_com_preco === 1 ? 'produto com preço' : 'produtos com preço' },
              { valor: '5', rotulo: 'os que você mais vende', destaque: true },
            ]),
            par('Os produtos que você mais vende são os que mais pesam no seu lucro. Cadastre esses primeiro: com os ingredientes já no app, cada um leva poucos minutos.'),
          ].join(''),
          cta: 'Cadastrar um produto',
        }),
      },
      {
        formato: 'carta', padrao: 'curiosidade',
        montar: (d) => ({
          assunto: 'Os produtos que pagam as suas contas',
          previa: 'Por onde continuar depois do primeiro preço.',
          titulo: 'Os produtos que pagam as suas contas',
          corpo: [
            ola(d),
            par('Depois do primeiro preço, a melhor ordem é simples: cadastre os produtos que você <b>mais vende</b>. São eles que pagam as contas no fim do mês.'),
            par('Como os ingredientes já estão no app, cada produto novo é só escolher o que vai na receita e quanto rende.'),
          ].join(''),
          cta: 'Cadastrar um produto',
        }),
      },
    ],
  },

  // ===== mensal (novidades) =====
  {
    id: 'mensal-tutoriais',
    para: 'mensal',
    variantes: [
      {
        formato: 'passo', padrao: 'curiosidade',
        montar: (d) => ({
          assunto: 'Aprenda o Precificaí em vídeos de 5 minutos',
          previa: 'Ingredientes, receitas base, embalagens e o primeiro preço.',
          selo: 'Novidades',
          titulo: 'Vídeos curtos, do jeito que você usa',
          corpo: [
            ola(d),
            par('Gravamos uma série de vídeos curtos mostrando cada parte do app na prática:'),
            video('t1'), video('t2'), video('t3'), video('t4'),
          ].join(''),
          cta: 'Abrir o Precificaí',
        }),
      },
      {
        formato: 'carta', padrao: 'pergunta',
        montar: (d) => ({
          assunto: 'Prefere aprender vendo?',
          previa: 'Fizemos vídeos de 5 minutos para cada parte do app.',
          titulo: 'Prefere aprender vendo?',
          corpo: [
            ola(d),
            par('Muita gente nos disse que aprende melhor vendo alguém fazer. Então gravamos vídeos curtos, de 4 a 5 minutos, com cada parte do Precificaí:'),
            video('t1'), video('t2'), video('t3'), video('t4'),
          ].join(''),
          cta: 'Abrir o Precificaí',
        }),
      },
    ],
  },
  {
    id: 'mensal-atualizar',
    para: 'mensal',
    variantes: [
      {
        formato: 'mito', padrao: 'pergunta',
        montar: () => ({
          assunto: 'Os preços subiram. O seu acompanhou?',
          previa: 'Atualize os ingredientes numa tela só e veja o novo preço sugerido.',
          titulo: 'O preço de um mês atrás ainda serve?',
          corpo: [
            htmlMito('O preço que calculei no começo do ano ainda serve.',
              'Se os ingredientes subiram, o mesmo preço deixa menos dinheiro no seu bolso todo mês.'),
            par('Em <b>Mais &rsaquo; Atualizar Preços</b> você troca o valor dos ingredientes numa tela só e o app recalcula todos os produtos.'),
          ].join(''),
          cta: 'Atualizar meus preços',
        }),
      },
      {
        formato: 'checklist', padrao: 'numero',
        montar: (d) => ({
          assunto: '3 conferências de 5 minutos para o seu preço',
          previa: 'Ingredientes, contas do mês e margem dos produtos.',
          titulo: 'Conferência do mês',
          corpo: [
            ola(d),
            par('Uma vez por mês, vale conferir:'),
            htmlChecklist([
              { feito: false, texto: 'Preço dos ingredientes que mais subiram, em <b>Atualizar Preços</b>' },
              { feito: false, texto: 'Contas do mês no <b>Financeiro</b>' },
              { feito: false, texto: 'Produtos com <b>Menor margem</b>, em Produtos' },
            ]),
          ].join(''),
          cta: 'Fazer a conferência',
        }),
      },
    ],
  },
];

// ---------- escolha ----------

export interface Escolha { tema: Tema; variante: Variante; campanha: string }

function temasPara(c: Candidato): Tema[] {
  const doPlano = (t: Tema) => !t.soGratis || c.plano === 'free';
  const novo = (t: Tema) => !c.temas_recebidos.includes(t.id);
  const daEtapa = TEMAS.filter((t) => t.para !== 'mensal' && t.para.includes(c.estagio) && doPlano(t) && novo(t));
  const mensais = TEMAS.filter((t) => t.para === 'mensal' && doPlano(t) && novo(t));
  // Depois do dia 90: novidades primeiro. Acabou o conteúdo da etapa: novidades, nunca repete.
  return c.fase === 'mensal' ? [...mensais, ...daEtapa] : [...daEtapa, ...mensais];
}

/**
 * Próximo e-mail da pessoa, ou null se não há tema novo para ela.
 * Formato: nunca o mesmo do último envio; evita os 3 últimos. Padrão do assunto:
 * evita o do último envio. Versão sem os dados de que precisa fica de fora.
 */
export function escolher(c: Candidato, d: Dados): Escolha | null {
  for (const tema of temasPara(c)) {
    const ok = tema.variantes.filter((v) => !v.requer || v.requer(d));
    if (!ok.length) continue;
    const nota = (v: Variante) =>
      (v.formato === c.formatos_recentes[0] ? -100 : 0)
      + (c.formatos_recentes.slice(1, 3).includes(v.formato) ? -10 : 0)
      + (v.padrao === c.padroes_recentes[0] ? -5 : 0);
    const melhor = ok.reduce((a, b) => (nota(b) > nota(a) ? b : a));
    if (nota(melhor) <= -100) continue; // só sobrou o mesmo formato do último e-mail: vai para o próximo tema
    return { tema, variante: melhor, campanha: `regua-${tema.id}` };
  }
  return null;
}

// ---------- montagem ----------

/** HTML → texto puro (versão text/plain do e-mail). */
function paraTexto(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|tr|h1|h2|div)>/gi, '\n')
    .replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, href, txt) => `${txt.replace(/<[^>]+>/g, '').trim()} (${href})`)
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&rsaquo;/g, '>').replace(/&rarr;/g, '->').replace(/&middot;/g, '·')
    .replace(/&#10003;/g, '[x]').replace(/&#9654;/g, '').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n\n');
}

export function montarRegua(e: Escolha, d: Dados, estagio: Estagio, linkSair: string): { assunto: string; html: string; texto: string } {
  const link = `${APP}?utm_source=email&utm_medium=email&utm_campaign=${encodeURIComponent(e.campanha)}&utm_content=${e.variante.formato}`;
  const c = e.variante.montar(d, link);
  const selo = c.selo ?? (e.variante.formato === 'passo' && e.tema.para !== 'mensal' && estagio !== 'ativo'
    ? `Passo ${PASSO[estagio] + 1} de 4` : SELO[e.variante.formato]);
  const html = moldura({
    formato: e.variante.formato, assunto: c.assunto, previa: c.previa, selo, titulo: c.titulo,
    corpo: c.corpo, link, cta: c.cta, linkSair,
  });
  const texto = [
    c.titulo,
    paraTexto(c.corpo),
    `${c.cta}: ${link}`,
    'Ficou alguma dúvida? Responda este e-mail que a gente ajuda.\n\nUm abraço,\nEquipe Precificaí',
    `Não quer mais receber dicas? ${linkSair}`,
    'APLICAI CONSULTORIA E TREINAMENTO LTDA · CNPJ 53.054.196/0001-63',
  ].join('\n\n');
  return { assunto: c.assunto, html, texto };
}

