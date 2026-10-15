import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { TEMAS, escolher, montarRegua } from '../supabase/functions/email-ciclo-vida/regua.ts';

// Conta de exemplo (kit de confeitaria, como a Doces da Ana dos tutoriais).
const cheia = {
  negocio: 'Doces da Ana', segmento: 'Confeitaria',
  insumos: 87, insumos_com_preco: 3, produtos: 2, produtos_com_preco: 1,
  produto_foco: { nome: 'Bolo de Chocolate 1kg', ingredientes: 9, ingredientes_sem_preco: 7, exemplos: ['Chocolate meio amargo', 'Creme de leite', 'Manteiga sem sal'] },
  insumos_recentes: ['Farinha de trigo', 'Açúcar', 'Ovos'],
  produtos_sem_preco: ['Cupcake'],
  ultimo_produto: { nome: 'Brigadeiro gourmet', preco: 2.5 },
  dias_sem_atualizar_precos: 42,
};
const vazia = {};
const ESTAGIOS = ['sem_perfil', 'sem_ingrediente', 'kit_sem_preco', 'sem_produto', 'produto_sem_preco', 'ativo'];
const cand = (o = {}) => ({ estagio: 'kit_sem_preco', plano: 'free', fase: 'semanal', temas_recebidos: [], formatos_recentes: [], padroes_recentes: [], ...o });

function problemas(m) {
  const tudo = `${m.assunto}\n${m.html}\n${m.texto}`;
  const p = [];
  for (const s of ['RR$', '—', 'undefined', 'null', 'NaN', 'Olá, !', '[object']) if (tudo.includes(s)) p.push(s);
  if (/[^&]nbsp;/.test(tudo)) p.push('nbsp; solto');
  if (/\b0 ingredientes? (esperando|no app)/.test(tudo)) p.push('0 ingredientes');
  return p;
}

test('régua: todo tema × versão × etapa renderiza sem texto quebrado, com e sem dados', () => {
  let n = 0;
  for (const tema of TEMAS) {
    for (const v of tema.variantes) {
      for (const d of [cheia, vazia]) {
        if (v.requer && !v.requer(d)) continue;
        const etapas = tema.para === 'mensal' ? ESTAGIOS : tema.para;
        for (const est of etapas) {
          const m = montarRegua({ tema, variante: v, campanha: `regua-${tema.id}` }, d, est, 'https://x/#sair');
          assert.deepEqual(problemas(m), [], `${tema.id}/${v.formato}/${est}/${d === cheia ? 'cheia' : 'vazia'}`);
          assert.ok(m.html.includes('https://x/#sair'), 'link de descadastro');
          assert.ok(m.html.includes(`utm_campaign=regua-${tema.id}`), 'utm da campanha');
          n++;
        }
      }
    }
  }
  assert.ok(n > 60, `renderizou ${n}`);
});

test('régua: cada tema tem 2 versões com formatos diferentes e toda etapa tem pelo menos 3 temas', () => {
  for (const t of TEMAS) assert.notEqual(t.variantes[0].formato, t.variantes[1].formato, t.id);
  for (const est of ESTAGIOS) {
    const n = TEMAS.filter((t) => t.para !== 'mensal' && t.para.includes(est)).length;
    assert.ok(n >= 3, `${est}: ${n} temas`);
  }
  assert.equal(new Set(TEMAS.map((t) => t.id)).size, TEMAS.length, 'ids únicos');
});

test('régua: escolhe tema da etapa ainda não recebido', () => {
  const e = escolher(cand(), cheia);
  assert.equal(e.campanha, `regua-${e.tema.id}`);
  assert.ok(e.tema.para.includes('kit_sem_preco'));
  const e2 = escolher(cand({ temas_recebidos: [e.tema.id] }), cheia);
  assert.notEqual(e2.tema.id, e.tema.id);
});

test('régua: nunca o mesmo formato do último e-mail', () => {
  for (const tema of TEMAS) {
    for (const ultimo of ['passo', 'painel', 'carta', 'mito', 'checklist']) {
      const c = cand({ estagio: 'ativo', temas_recebidos: TEMAS.filter((t) => t !== tema).map((t) => t.id), formatos_recentes: [ultimo] });
      const e = escolher(c, cheia);
      if (e) assert.notEqual(e.variante.formato, ultimo, `${tema.id} depois de ${ultimo}`);
    }
  }
});

test('régua: evita o padrão de assunto do último e-mail quando há opção', () => {
  const tema = TEMAS.find((t) => t.id === 'custo-real'); // mito/curiosidade e carta/pergunta
  const c = cand({ estagio: 'sem_perfil', padroes_recentes: ['curiosidade'], formatos_recentes: ['painel'] });
  assert.equal(escolher(c, vazia).tema.id, tema.id);
  assert.equal(escolher(c, vazia).variante.padrao, 'pergunta');
});

test('régua: versão que precisa de dados fica de fora quando eles faltam', () => {
  // produto-foco: painel exige ingredientes, checklist exige negócio + produto
  const c = cand({ temas_recebidos: ['como-voce-compra'] });
  const e = escolher(c, vazia);
  assert.notEqual(e.tema.id, 'produto-foco');
  const comDados = escolher(c, cheia);
  assert.equal(comDados.tema.id, 'produto-foco');
});

test('régua: Pro só para quem está no Grátis', () => {
  const recebidos = ['atualizar-precos', 'mais-lucro'];
  assert.equal(escolher(cand({ estagio: 'ativo', temas_recebidos: recebidos }), cheia).tema.id, 'pro-delivery');
  assert.notEqual(escolher(cand({ estagio: 'ativo', plano: 'pro', temas_recebidos: recebidos }), cheia).tema.id, 'pro-delivery');
});

test('régua: fase mensal começa pelas novidades; etapa esgotada cai nas novidades; tudo recebido = nada', () => {
  assert.equal(escolher(cand({ fase: 'mensal' }), cheia).tema.para, 'mensal');
  const daEtapa = TEMAS.filter((t) => t.para !== 'mensal' && t.para.includes('kit_sem_preco')).map((t) => t.id);
  assert.equal(escolher(cand({ temas_recebidos: daEtapa }), cheia).tema.para, 'mensal');
  assert.equal(escolher(cand({ temas_recebidos: TEMAS.map((t) => t.id) }), cheia), null);
});

test('régua: nome digitado é escapado e cortado', () => {
  const d = { ...cheia, negocio: '<script>alert(1)</script> Doces com um nome muito comprido demais da conta' };
  const tema = TEMAS.find((t) => t.id === 'produto-foco');
  const m = montarRegua({ tema, variante: tema.variantes[1], campanha: 'regua-produto-foco' }, d, 'kit_sem_preco', 'https://x/#sair');
  assert.ok(!m.html.includes('<script>'));
  assert.ok(m.html.includes('&lt;script&gt;'));
  assert.ok(m.assunto.includes('…'));
});
