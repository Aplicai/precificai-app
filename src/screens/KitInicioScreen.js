import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, Platform, Modal } from 'react-native';
import { CommonActions } from '@react-navigation/native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getDatabase } from '../database/database';
import { clearQueryCache } from '../database/supabaseDb';
import { supabase } from '../config/supabase';
import { colors, spacing, fonts, fontFamily, borderRadius } from '../utils/theme';
import {
  SEGMENTOS,
  INSUMOS_POR_SEGMENTO,
  CATEGORIAS_POR_SEGMENTO,
  EMBALAGENS_POR_SEGMENTO,
  PREPAROS_POR_SEGMENTO,
  PRODUTOS_POR_SEGMENTO,
  CATEGORIAS_PRODUTOS_POR_SEGMENTO,
  CATEGORIAS_PREPAROS_POR_SEGMENTO,
  CATEGORIAS_EMBALAGENS_POR_SEGMENTO,
} from '../data/templates';
import { calcPrecoBase, calcFatorCorrecao } from '../utils/calculations';
import { getPrecoReferencia } from '../data/precosReferencia';
// D-27/D-28: aplica fatores de correção de referência (TACO) automaticamente
import { getFatorCorrecaoReferencia, estimarQuantidadeLiquida } from '../data/fatoresCorrecao';
import useResponsiveLayout from '../hooks/useResponsiveLayout';

// APP-14: marcador no campo `marca` pra UI mostrar badge "valor estimado".
// Usar uma string única que o usuário não digitaria por acidente.
export const MARCA_VALOR_ESTIMADO = '__VALOR_ESTIMADO_KIT__';

// F1-J1-01: prefixo da chave de step do WelcomeTour. Mantido em sync com
// `WelcomeTourScreen.js` — chegando aqui o tour é considerado encerrado, então
// removemos o passo salvo para evitar reabrir o usuário no meio do tour caso
// volte para a tela de welcome em algum cenário de fluxo.
const WELCOMETOUR_STEP_KEY_PREFIX = 'welcometour_step_';

// Audit P0: helper defensivo para formatação de valores numéricos vindos do template.
function safeNum(v) {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

const SEGMENT_ICONS = {
  confeitaria: { set: 'material', name: 'cake-variant' },
  hamburgueria: { set: 'material', name: 'hamburger' },
  pizzaria: { set: 'material', name: 'pizza' },
  restaurante: { set: 'material', name: 'silverware-fork-knife' },
  padaria: { set: 'material', name: 'bread-slice' },
  marmitaria: { set: 'feather', name: 'package' },
  acai: { set: 'material', name: 'cup' },
  cafeteria: { set: 'material', name: 'coffee' },
  sorveteria: { set: 'material', name: 'ice-cream' },
  salgaderia: { set: 'material', name: 'food-drumstick' },
  japonesa: { set: 'material', name: 'fish' },
  outro: { set: 'feather', name: 'grid' },
};

export default function KitInicioScreen({ navigation, route }) {
  const isSetup = route?.params?.setup === true;
  const { isMobile } = useResponsiveLayout();
  const bottomOffset = isMobile ? 86 : 16; // BottomTab clearance on mobile
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  // Sessão 28.16: checkbox único pra sobrescrever (substitui fluxo confuso de 2-botões)
  const [sobrescrever, setSobrescrever] = useState(false);
  // Sessão 28.9 — feedback de progresso do kit (modal overlay)
  const [progressStep, setProgressStep] = useState(null);
  const [progressMsg, setProgressMsg] = useState('');
  const [progressCount, setProgressCount] = useState({ categorias: 0, insumos: 0, embalagens: 0, preparos: 0, produtos: 0 });

  // F1-J1-01: usuário chegou no Kit de Início → o WelcomeTour ficou para trás.
  // Limpamos a chave de passo salvo (qualquer user_id) para garantir que uma
  // próxima abertura do tour comece do zero. Não bloqueante.
  useEffect(() => {
    (async () => {
      try {
        const keys = await AsyncStorage.getAllKeys();
        const stepKeys = keys.filter(k => k.startsWith(WELCOMETOUR_STEP_KEY_PREFIX));
        if (stepKeys.length > 0) {
          await AsyncStorage.multiRemove(stepKeys);
        }
      } catch (e) {
        console.error('[KitInicio.clearWelcomeTourStep]', e);
      }
    })();
  }, []);

  async function navegarAposKit() {
    try {
      await AsyncStorage.setItem('onboarding_done', 'true');
      // Audit P1: persistir o segmento escolhido para futura referência (relatórios,
      // sugestões de templates, recomendações). Falha não bloqueia navegação.
      if (selected) {
        try {
          await AsyncStorage.setItem('segmento_negocio', selected);
        } catch (e) {
          console.error('[KitInicio.persistSegmento]', e);
        }
      }
      if (isSetup) {
        navigation.replace('Onboarding');
      } else {
        if (navigation.canGoBack()) {
          navigation.goBack();
        } else {
          // F1-J1-02 (P0): reset completo do stack ao cair em MainTabs sem
          // histórico válido — evita rotas residuais do fluxo de setup.
          navigation.dispatch(
            CommonActions.reset({
              index: 0,
              routes: [{ name: 'MainTabs' }],
            })
          );
        }
      }
    } catch (e) {
      console.error('[KitInicio.navegarAposKit]', e);
      // F1-J1-02 (P0): fallback de erro também precisa garantir stack limpo.
      navigation.dispatch(
        CommonActions.reset({
          index: 0,
          routes: [{ name: 'MainTabs' }],
        })
      );
    }
  }

  async function aplicarKit() {
    if (!selected) return;

    if (selected === 'outro') {
      navegarAposKit();
      return;
    }

    // Sessão 28.16: UX simplificada — checkbox `sobrescrever` decide o comportamento.
    // Substitui o fluxo confuso de "Adicionar/Substituir tudo" + dupla confirmação.
    // Setup (primeiro uso) sempre adiciona — banco vazio.
    if (isSetup) {
      await executarKit(false);
      return;
    }

    if (sobrescrever) {
      const msg = 'Sobrescrever vai APAGAR todos os insumos, preparos, produtos, embalagens e categorias atuais antes de aplicar o kit. Esta ação não pode ser desfeita. Deseja continuar?';
      if (Platform.OS === 'web') {
        if (!window.confirm(msg)) return;
        await executarKit(true);
      } else {
        Alert.alert('Sobrescrever dados', msg, [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Apagar e aplicar', style: 'destructive', onPress: () => executarKit(true) },
        ]);
      }
      return;
    }

    // Padrão: ADICIONA aos existentes (preservando)
    await executarKit(false);
  }

  async function executarKit(resetar) {
    setLoading(true);
    setProgressStep('iniciando');
    setProgressMsg('Verificando autenticação...');
    setProgressCount({ categorias: 0, insumos: 0 });
    try {
      const { data: authData, error: authErr } = await supabase.auth.getUser();
      if (authErr) throw new Error('Erro de autenticação: ' + authErr.message);
      const userId = authData?.user?.id;
      if (!userId) throw new Error('Usuário não autenticado');

      const insumosTemplate = INSUMOS_POR_SEGMENTO[selected] || [];
      const categoriasTemplate = CATEGORIAS_POR_SEGMENTO[selected] || [];

      // Step 1: Clean existing data — sequential in FK-safe order
      // Sessão 28.9 (revisão Kit): erros das fases agora são LOGADOS em vez de
      // engolidos silenciosamente. Antes, qualquer falha de RLS/FK quebrava o
      // kit sem feedback. Agora aparecem no console pra debug se necessário.
      if (resetar || isSetup) {
        setProgressStep('limpando');
        setProgressMsg('Limpando dados anteriores...');
        const collectErrors = async (phaseName, tables) => {
          const errs = [];
          await Promise.all(tables.map(async t => {
            try {
              const { error } = await supabase.from(t).delete().eq('user_id', userId);
              if (error) errs.push({ table: t, msg: error.message, code: error.code });
            } catch (e) {
              errs.push({ table: t, msg: e?.message || String(e) });
            }
          }));
          if (errs.length > 0) console.warn(`[KitInicio.${phaseName}] erros não-fatais:`, errs);
        };

        // Phase 1: Junction tables (no dependencies)
        await collectErrors('phase1_junctions', [
          'produto_ingredientes', 'produto_preparos', 'produto_embalagens',
          'preparo_ingredientes', 'delivery_combo_itens', 'delivery_produto_itens',
        ]);

        // Phase 2: Main entity tables
        await collectErrors('phase2_entities', [
          'delivery_combos', 'delivery_produtos', 'delivery_adicionais',
          'delivery_config', 'produtos', 'preparos', 'embalagens',
        ]);

        // Phase 3: materias_primas (FK alvo de preparo_ingredientes e produto_ingredientes)
        const { error: mpErr } = await supabase.from('materias_primas').delete().eq('user_id', userId);
        if (mpErr) {
          console.error('[KitInicio.phase3_materias_primas] erro CRÍTICO:', mpErr);
          throw new Error('Erro ao limpar insumos antes do reset: ' + mpErr.message);
        }

        // Phase 4: Category tables (materias_primas FK liberada)
        await collectErrors('phase4_categorias', [
          'categorias_produtos', 'categorias_preparos',
          'categorias_embalagens', 'categorias_insumos',
        ]);
      }

      // Step 2: Insert categories and build name→id map
      setProgressStep('categorias');
      setProgressMsg(`Cadastrando ${categoriasTemplate.length} categorias...`);
      const catMap = {};
      if (categoriasTemplate.length > 0) {
        const catRows = categoriasTemplate.map(nome => ({
          user_id: userId,
          nome,
          icone: '📦',
        }));
        const { data: catData, error: catErr } = await supabase
          .from('categorias_insumos')
          .insert(catRows)
          .select('id, nome');
        if (catErr) {
          console.error('[KitInicio.step2_categorias] erro:', catErr, 'rows:', catRows.length);
          throw new Error('Erro ao cadastrar categorias: ' + catErr.message);
        }
        (catData || []).forEach(cat => { catMap[cat.nome] = cat.id; });
        setProgressCount(p => ({ ...p, categorias: catData?.length || 0 }));
        console.log(`[KitInicio] ${catData?.length || 0} categorias cadastradas`);
      }

      // Step 3: Insert insumos with correct category mapping
      setProgressStep('insumos');
      setProgressMsg(`Cadastrando ${insumosTemplate.length} insumos...`);
      let criados = 0;
      // APP-52 — total geral de itens preservados (insumos + embalagens + preparos + produtos)
      let totalPulados = 0;
      if (insumosTemplate.length > 0) {
        // APP-52: dedup. Quando aplicando kit ADICIONAL (sem reset), não duplicar
        // insumos que já existem. Compara por nome (case-insensitive, trim).
        let existentesNomes = new Set();
        if (!resetar) {
          try {
            const { data: existentes } = await supabase
              .from('materias_primas')
              .select('nome')
              .eq('user_id', userId);
            (existentes || []).forEach(r => {
              if (r?.nome) existentesNomes.add(String(r.nome).trim().toLowerCase());
            });
          } catch (_) { /* defensivo */ }
        }
        const firstCatId = Object.values(catMap)[0] || null;
        const insumoRowsRaw = insumosTemplate.map(insumo => {
          // D-27/D-28: se template tem FC = 1 mas há referência conhecida (TACO), usa a referência
          let qtBruta = insumo.quantidade_bruta;
          let qtLiquida = insumo.quantidade_liquida;
          const fcTemplate = calcFatorCorrecao(qtBruta, qtLiquida);
          if (Math.abs(fcTemplate - 1) < 0.01) {
            // Template não tem perda — checa se tem referência TACO
            const fcRef = getFatorCorrecaoReferencia(insumo.nome);
            if (fcRef > 1.05) {
              // Aplica FC de referência ajustando quantidade líquida
              qtLiquida = estimarQuantidadeLiquida(qtBruta, insumo.nome);
            }
          }
          const fc = calcFatorCorrecao(qtBruta, qtLiquida);
          // APP-14: tenta pré-preencher com preço médio de mercado pra evitar
          // que a usuária precise pesquisar valor de cada insumo do zero.
          const valorRef = getPrecoReferencia(selected, insumo.nome);
          const valorFinal = valorRef != null ? valorRef : (insumo.valor_pago || 0);
          const isEstimado = valorRef != null;
          // D-27: usa qtLiquida ajustada (não a do template)
          const pb = calcPrecoBase(valorFinal, qtLiquida, insumo.unidade_medida);
          return {
            user_id: userId,
            nome: insumo.nome,
            // APP-14: marcador interno pra UI exibir badge "valor estimado, ajuste".
            marca: isEstimado ? MARCA_VALOR_ESTIMADO : '',
            categoria_id: (insumo.categoria && catMap[insumo.categoria]) || firstCatId,
            quantidade_bruta: qtBruta,
            quantidade_liquida: qtLiquida,
            fator_correcao: fc,
            unidade_medida: insumo.unidade_medida,
            valor_pago: valorFinal,
            preco_por_kg: pb,
          };
        });
        // APP-52: filtra duplicados antes do INSERT
        const insumoRows = insumoRowsRaw.filter(r => !existentesNomes.has(String(r.nome).trim().toLowerCase()));
        const pulados = insumoRowsRaw.length - insumoRows.length;
        totalPulados += pulados;
        if (pulados > 0) {
          console.log(`[KitInicio] ${pulados} insumos já existiam — não duplicados (APP-52)`);
        }
        if (insumoRows.length > 0) {
          const { data: insData, error: insErr } = await supabase
            .from('materias_primas')
            .insert(insumoRows)
            .select('id');
          if (insErr) {
            console.error('[KitInicio.step3_insumos] erro:', insErr, 'rows:', insumoRows.length);
            throw new Error('Erro ao cadastrar insumos: ' + insErr.message);
          }
          criados = insData?.length || 0;
        }
        setProgressCount(p => ({ ...p, insumos: criados }));
        console.log(`[KitInicio] ${criados} insumos cadastrados (${pulados} pulados por já existirem)`);
      }

      // Build map: nome insumo → id (pra usar nos preparos depois)
      // Re-busca após insert pra garantir que pegamos os ids
      const insumosMap = {};
      try {
        const { data: insumosCadastrados } = await supabase
          .from('materias_primas').select('id, nome').eq('user_id', userId);
        (insumosCadastrados || []).forEach(i => { insumosMap[i.nome] = i.id; });
      } catch (e) { console.warn('[KitInicio] falha ao buscar insumos cadastrados:', e); }

      // ===== Step 4: Embalagens =====
      const embalagensTemplate = EMBALAGENS_POR_SEGMENTO[selected] || [];
      const catEmbTemplate = CATEGORIAS_EMBALAGENS_POR_SEGMENTO[selected] || [];
      const catEmbMap = {};
      const embalagensMap = {};
      let embsCriadas = 0;
      if (embalagensTemplate.length > 0) {
        setProgressStep('embalagens');
        setProgressMsg(`Cadastrando ${embalagensTemplate.length} embalagens...`);

        // 4a — categorias de embalagens
        if (catEmbTemplate.length > 0) {
          const catEmbRows = catEmbTemplate.map(nome => ({ user_id: userId, nome, icone: '📦' }));
          const { data: catEmbData, error: catEmbErr } = await supabase
            .from('categorias_embalagens').insert(catEmbRows).select('id, nome');
          if (catEmbErr) console.warn('[KitInicio.embalagens.categorias]', catEmbErr);
          (catEmbData || []).forEach(c => { catEmbMap[c.nome] = c.id; });
        }

        // 4b — embalagens
        const embRows = embalagensTemplate.map(emb => ({
          user_id: userId,
          nome: emb.nome,
          marca: emb.marca || '',
          categoria_id: catEmbMap[emb.categoria] || Object.values(catEmbMap)[0] || null,
          quantidade: emb.quantidade,
          unidade_medida: emb.unidade_medida,
          preco_embalagem: emb.preco_embalagem,
          preco_unitario: emb.preco_unitario,
        }));
        const { data: embData, error: embErr } = await supabase
          .from('embalagens').insert(embRows).select('id, nome');
        if (embErr) {
          console.error('[KitInicio.step4_embalagens] erro:', embErr);
          throw new Error('Erro ao cadastrar embalagens: ' + embErr.message);
        }
        (embData || []).forEach(e => { embalagensMap[e.nome] = e.id; });
        embsCriadas = embData?.length || 0;
        setProgressCount(p => ({ ...p, embalagens: embsCriadas }));
        console.log(`[KitInicio] ${embsCriadas} embalagens cadastradas`);
      }

      // ===== Step 5: Preparos =====
      const preparosTemplate = PREPAROS_POR_SEGMENTO[selected] || [];
      const catPrepTemplate = CATEGORIAS_PREPAROS_POR_SEGMENTO[selected] || [];
      const catPrepMap = {};
      const preparosMap = {};
      let prepsCriados = 0;
      if (preparosTemplate.length > 0) {
        setProgressStep('preparos');
        setProgressMsg(`Cadastrando ${preparosTemplate.length} preparos...`);

        // 5a — categorias de preparos
        if (catPrepTemplate.length > 0) {
          const catPrepRows = catPrepTemplate.map(nome => ({ user_id: userId, nome, icone: '🥄' }));
          const { data: catPrepData, error: catPrepErr } = await supabase
            .from('categorias_preparos').insert(catPrepRows).select('id, nome');
          if (catPrepErr) console.warn('[KitInicio.preparos.categorias]', catPrepErr);
          (catPrepData || []).forEach(c => { catPrepMap[c.nome] = c.id; });
        }

        // 5b — preparos (um por um pra coletar id e inserir ingredientes em sequência)
        for (const prep of preparosTemplate) {
          // Calcular custo total do preparo somando custo dos ingredientes
          let custoTotalPrep = 0;
          const ingsValidos = [];
          for (const ing of prep.ingredientes) {
            const insumoId = insumosMap[ing.nome_insumo];
            if (!insumoId) {
              console.warn(`[KitInicio.preparos] insumo "${ing.nome_insumo}" não encontrado, pulando`);
              continue;
            }
            // Buscar preco_por_kg do insumo cadastrado (já com cálculo correto)
            const insumoOriginal = (insumosTemplate || []).find(i => i.nome === ing.nome_insumo);
            const precoPorKg = insumoOriginal ? calcPrecoBase(insumoOriginal.valor_pago, insumoOriginal.quantidade_liquida, insumoOriginal.unidade_medida) : 0;
            // Custo do uso: ing em g/ml/un × preco_por_kg/1000 (ou × preco_por_un se ehUnidade)
            const u = String(ing.unidade || 'g').toLowerCase();
            const ehUn = u === 'un' || u.includes('unid');
            const custoUso = ehUn ? (precoPorKg * ing.quantidade) : (precoPorKg / 1000) * ing.quantidade;
            custoTotalPrep += custoUso;
            ingsValidos.push({ ...ing, insumoId, custoUso });
          }
          const custoPorKg = prep.rendimento_total > 0 ? (custoTotalPrep / prep.rendimento_total) * 1000 : 0;

          const prepRow = {
            user_id: userId,
            nome: prep.nome,
            categoria_id: catPrepMap[prep.categoria] || null,
            rendimento_total: prep.rendimento_total,
            unidade_medida: prep.unidade_medida,
            custo_total: custoTotalPrep,
            custo_por_kg: custoPorKg,
            modo_preparo: '',
            observacoes: '',
            validade_dias: 0,
          };
          const { data: prepData, error: prepErr } = await supabase
            .from('preparos').insert(prepRow).select('id').single();
          if (prepErr) {
            console.error('[KitInicio.step5_preparos] erro:', prepErr, 'preparo:', prep.nome);
            continue;
          }
          preparosMap[prep.nome] = prepData.id;
          prepsCriados++;

          // 5c — ingredientes do preparo (FK exige user_id)
          if (ingsValidos.length > 0) {
            const ingRows = ingsValidos.map(ing => ({
              user_id: userId,
              preparo_id: prepData.id,
              materia_prima_id: ing.insumoId,
              quantidade_utilizada: ing.quantidade,
              custo: ing.custoUso,
            }));
            const { error: ingErr } = await supabase.from('preparo_ingredientes').insert(ingRows);
            if (ingErr) console.warn(`[KitInicio.preparos.ingredientes] preparo "${prep.nome}":`, ingErr);
          }
        }
        setProgressCount(p => ({ ...p, preparos: prepsCriados }));
        console.log(`[KitInicio] ${prepsCriados} preparos cadastrados`);
      }

      // ===== Step 6: Produtos =====
      const produtosTemplate = PRODUTOS_POR_SEGMENTO[selected] || [];
      const catProdTemplate = CATEGORIAS_PRODUTOS_POR_SEGMENTO[selected] || [];
      const catProdMap = {};
      let prodsCriados = 0;
      if (produtosTemplate.length > 0) {
        setProgressStep('produtos');
        setProgressMsg(`Cadastrando ${produtosTemplate.length} produtos...`);

        // 6a — categorias de produtos
        if (catProdTemplate.length > 0) {
          const catProdRows = catProdTemplate.map(nome => ({ user_id: userId, nome, icone: '🍰' }));
          const { data: catProdData, error: catProdErr } = await supabase
            .from('categorias_produtos').insert(catProdRows).select('id, nome');
          if (catProdErr) console.warn('[KitInicio.produtos.categorias]', catProdErr);
          (catProdData || []).forEach(c => { catProdMap[c.nome] = c.id; });
        }

        // 6b — produtos (um por um pra inserir ingredientes/preparos/embalagens em sequência)
        for (const prod of produtosTemplate) {
          // ⚠️ Sessão 28.9 fix: temp_*/tempo_* SÃO TEXT no schema, não REAL.
          // Enviar 0 (number) causa erro de tipo no PG. Enviar string vazia.
          const prodRow = {
            user_id: userId,
            nome: prod.nome,
            categoria_id: catProdMap[prod.categoria] || null,
            rendimento_total: prod.rendimento_total,
            unidade_rendimento: prod.unidade_rendimento,
            rendimento_unidades: prod.rendimento_unidades,
            tempo_preparo: 0,
            preco_venda: prod.preco_venda,
            margem_lucro_produto: 0,
            validade_dias: 0,
            temp_congelado: '', tempo_congelado: '',
            temp_refrigerado: '', tempo_refrigerado: '',
            temp_ambiente: '', tempo_ambiente: '',
            modo_preparo: '',
            observacoes: 'Exemplo do Kit de Início — ajuste conforme sua receita.',
          };
          const { data: prodData, error: prodErr } = await supabase
            .from('produtos').insert(prodRow).select('id').single();
          if (prodErr) {
            console.error('[KitInicio.step6_produtos] erro:', prodErr, 'produto:', prod.nome);
            continue;
          }
          prodsCriados++;

          // ⚠️ Sessão 28.9 fix: junction tables EXIGEM user_id (NOT NULL + RLS).
          // Sem isso, INSERTs falham silenciosamente (RLS recusa).
          for (const ing of (prod.ingredientes || [])) {
            const insId = insumosMap[ing.nome_insumo];
            if (!insId) { console.warn(`[KitInicio.produtos] insumo "${ing.nome_insumo}" não achado pra produto "${prod.nome}"`); continue; }
            const { error: piErr } = await supabase.from('produto_ingredientes').insert({
              user_id: userId, produto_id: prodData.id, materia_prima_id: insId, quantidade_utilizada: ing.quantidade,
            });
            if (piErr) console.warn(`[KitInicio.produto_ingredientes]`, piErr);
          }
          // preparos do produto
          for (const pp of (prod.preparos || [])) {
            const prepId = preparosMap[pp.nome_preparo];
            if (!prepId) { console.warn(`[KitInicio.produtos] preparo "${pp.nome_preparo}" não achado pra produto "${prod.nome}"`); continue; }
            const { error: ppErr } = await supabase.from('produto_preparos').insert({
              user_id: userId, produto_id: prodData.id, preparo_id: prepId, quantidade_utilizada: pp.quantidade,
            });
            if (ppErr) console.warn(`[KitInicio.produto_preparos]`, ppErr);
          }
          // embalagens do produto
          for (const pe of (prod.embalagens || [])) {
            const embId = embalagensMap[pe.nome_embalagem];
            if (!embId) { console.warn(`[KitInicio.produtos] embalagem "${pe.nome_embalagem}" não achada pra produto "${prod.nome}"`); continue; }
            const { error: peErr } = await supabase.from('produto_embalagens').insert({
              user_id: userId, produto_id: prodData.id, embalagem_id: embId, quantidade_utilizada: pe.quantidade,
            });
            if (peErr) console.warn(`[KitInicio.produto_embalagens]`, peErr);
          }
        }
        setProgressCount(p => ({ ...p, produtos: prodsCriados }));
        console.log(`[KitInicio] ${prodsCriados} produtos cadastrados`);
      }

      // Sessão 28.9 — invalidar cache do wrapper supabaseDb pra que outras telas
      // (Materias Primas, Home, etc.) leiam os dados frescos. Sem isso, podia
      // demorar até 2s pra dados aparecerem na UI por causa do TTL do cache.
      setProgressStep('finalizando');
      setProgressMsg('Atualizando o app...');
      try { clearQueryCache(); } catch (e) { /* defensivo */ }

      setProgressStep('sucesso');
      const partes = [];
      if (criados > 0)        partes.push(`${criados} insumo${criados === 1 ? '' : 's'}`);
      if (embsCriadas > 0)    partes.push(`${embsCriadas} embalagen${embsCriadas === 1 ? 'm' : 's'}`);
      if (prepsCriados > 0)   partes.push(`${prepsCriados} preparo${prepsCriados === 1 ? '' : 's'}`);
      if (prodsCriados > 0)   partes.push(`${prodsCriados} produto${prodsCriados === 1 ? '' : 's'}`);
      // APP-52 — informa quantos itens foram preservados (multi-kit sem sobrescrever)
      let msgFinal = `Pronto! ${partes.join(', ')}.`;
      if (!resetar && totalPulados > 0) {
        msgFinal += ` ${totalPulados} ite${totalPulados === 1 ? 'm' : 'ns'} já existiam e foram preservados.`;
      }
      setProgressMsg(msgFinal);
      setDone(true);
      setLoading(false);
      // Sessão 28.9 — NÃO auto-fecha. User precisa LER o aviso de "atualize preços"
      // e clicar pra continuar (botão dispara navegação pra Insumos).
    } catch (e) {
      setLoading(false);
      setProgressStep(null);
      // Audit P1: log técnico no console + mensagem amigável (sem expor stack/SQL).
      console.error('[KitInicio.executarKit]', e);
      const errMsg = 'Não foi possível aplicar o kit. Verifique sua conexão e tente novamente. Se o problema continuar, fale com o suporte.';
      if (Platform.OS === 'web') {
        window.alert(errMsg);
      } else {
        Alert.alert('Erro', errMsg);
      }
    }
  }

  const segmentoInfo = selected ? SEGMENTOS.find(s => s.key === selected) : null;
  const insumosCount = selected ? (INSUMOS_POR_SEGMENTO[selected]?.length || 0) : 0;
  const categoriasCount = selected ? (CATEGORIAS_POR_SEGMENTO[selected]?.length || 0) : 0;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Botão Voltar */}
        {isSetup && (
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => navigation.canGoBack() ? navigation.goBack() : navigation.replace('ProfileSetup')}
            activeOpacity={0.7}
          >
            <Feather name="arrow-left" size={18} color={colors.primary} />
            <Text style={styles.backBtnText}>Voltar</Text>
          </TouchableOpacity>
        )}

        {/* Sessão 28.9 — Header limpo, alinhado com padrão dos modais (icon circle + título à esquerda) */}
        <View style={styles.pageHeader}>
          <View style={styles.pageHeaderIcon}>
            <Feather name="zap" size={20} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.pageHeaderTitle}>Kit de Início Rápido</Text>
            <Text style={styles.pageHeaderDesc}>
              Escolha seu segmento. Cadastramos insumos, embalagens, preparos e produtos de exemplo pra você.
            </Text>
          </View>
        </View>

        {/* Aviso de reset quando acessado pelas Configurações */}
        {!isSetup && (
          <View style={styles.warningCard}>
            <Feather name="alert-triangle" size={16} color={colors.warning} />
            <Text style={styles.warningText}>
              Trocar o segmento APAGA todos os insumos, preparos, embalagens e produtos atuais.
            </Text>
          </View>
        )}

        {/* Segmentos Grid — visual limpo, ícones Feather padronizados */}
        <Text style={styles.sectionLabel}>Segmento do seu negócio</Text>
        <View style={styles.grid}>
          {SEGMENTOS.map(seg => {
            const iconDef = SEGMENT_ICONS[seg.key];
            const isSelected = selected === seg.key;
            const IconComp = iconDef.set === 'material' ? MaterialCommunityIcons : Feather;
            const hasFullKit = !!(PRODUTOS_POR_SEGMENTO[seg.key] && PRODUTOS_POR_SEGMENTO[seg.key].length > 0);

            return (
              <TouchableOpacity
                key={seg.key}
                style={[styles.segCard, isSelected && styles.segCardSelected]}
                onPress={() => setSelected(seg.key)}
                activeOpacity={0.7}
              >
                <View style={[styles.segIconCircle, isSelected && styles.segIconCircleSelected]}>
                  <IconComp name={iconDef.name} size={20} color={isSelected ? '#fff' : colors.primary} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.segLabel, isSelected && styles.segLabelSelected]} numberOfLines={1}>{seg.label}</Text>
                  <Text style={styles.segDesc} numberOfLines={2}>{seg.desc}</Text>
                  {hasFullKit && (
                    <View style={styles.segBadgeFull}>
                      <Feather name="check" size={9} color="#fff" />
                      <Text style={styles.segBadgeFullText}>Kit completo</Text>
                    </View>
                  )}
                </View>
                {isSelected && (
                  <View style={styles.segCheckCircle}>
                    <Feather name="check" size={12} color="#fff" />
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Preview do que será cadastrado */}
        {selected && selected !== 'outro' && (
          <View style={styles.previewCard}>
            <Text style={styles.previewTitle}>O que será cadastrado</Text>
            <View style={styles.previewRow}>
              <View style={styles.previewItem}>
                <Text style={styles.previewNumber}>{categoriasCount}</Text>
                <Text style={styles.previewLabel}>Categorias</Text>
              </View>
              <View style={styles.previewItem}>
                <Text style={styles.previewNumber}>{insumosCount}</Text>
                <Text style={styles.previewLabel}>Insumos</Text>
              </View>
              {(EMBALAGENS_POR_SEGMENTO[selected] || []).length > 0 && (
                <View style={styles.previewItem}>
                  <Text style={styles.previewNumber}>{(EMBALAGENS_POR_SEGMENTO[selected] || []).length}</Text>
                  <Text style={styles.previewLabel}>Embalagens</Text>
                </View>
              )}
              {(PREPAROS_POR_SEGMENTO[selected] || []).length > 0 && (
                <View style={styles.previewItem}>
                  <Text style={styles.previewNumber}>{(PREPAROS_POR_SEGMENTO[selected] || []).length}</Text>
                  <Text style={styles.previewLabel}>Preparos</Text>
                </View>
              )}
              {(PRODUTOS_POR_SEGMENTO[selected] || []).length > 0 && (
                <View style={styles.previewItem}>
                  <Text style={styles.previewNumber}>{(PRODUTOS_POR_SEGMENTO[selected] || []).length}</Text>
                  <Text style={styles.previewLabel}>Produtos</Text>
                </View>
              )}
            </View>
            {/* Aviso forte: preços vêm zerados, user precisa atualizar */}
            <View style={styles.precoZeroWarning}>
              <Feather name="alert-triangle" size={14} color="#B45309" />
              <View style={{ flex: 1 }}>
                <Text style={styles.precoZeroTitle}>Atenção: preços vêm em R$ 0,00</Text>
                <Text style={styles.precoZeroDesc}>
                  Você vai precisar abrir cada insumo, embalagem e produto e colocar o valor REAL do seu fornecedor pra que custos e margens fiquem corretos. A gente NÃO inventa preços pra você não confiar em valor errado.
                </Text>
              </View>
            </View>

            {/* Amostras de produtos prontos quando há kit completo */}
            {(PRODUTOS_POR_SEGMENTO[selected] || []).length > 0 && (
              <View style={styles.previewList}>
                <Text style={styles.previewListTitle}>Produtos de exemplo</Text>
                {(PRODUTOS_POR_SEGMENTO[selected] || []).map((p, i) => (
                  <View key={i} style={styles.previewListItem}>
                    <Text style={styles.previewListName} numberOfLines={1}>{p.nome}</Text>
                    <Text style={styles.previewListPrice}>R$ {safeNum(p.preco_venda).toFixed(2)}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

      </ScrollView>

      {/* Sticky bottom CTA */}
      {selected && (
        <View style={[styles.stickyFooter, { bottom: bottomOffset }]} pointerEvents="box-none">
          {/* Sessão 28.16: checkbox sobrescrever (apenas fora do setup inicial) */}
          {selected !== 'outro' && !isSetup && (
            <TouchableOpacity
              onPress={() => setSobrescrever(s => !s)}
              activeOpacity={0.7}
              style={{
                flexDirection: 'row', alignItems: 'flex-start', gap: 10,
                padding: 12, marginBottom: 10,
                backgroundColor: sobrescrever ? '#FEF2F2' : '#F9FAFB',
                borderWidth: 1.5,
                borderColor: sobrescrever ? '#DC2626' : '#E5E7EB',
                borderRadius: 10,
              }}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: sobrescrever }}
            >
              <View style={{
                width: 22, height: 22, borderRadius: 4,
                borderWidth: 2, borderColor: sobrescrever ? '#DC2626' : '#9CA3AF',
                backgroundColor: sobrescrever ? '#DC2626' : '#fff',
                alignItems: 'center', justifyContent: 'center', marginTop: 2,
              }}>
                {sobrescrever && <Feather name="check" size={14} color="#fff" />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontFamily: fontFamily.bold, color: sobrescrever ? '#991B1B' : '#111827' }}>
                  Sobrescrever dados existentes
                </Text>
                <Text style={{ fontSize: 12, color: sobrescrever ? '#991B1B' : '#6B7280', marginTop: 2 }}>
                  {sobrescrever
                    ? '⚠️ APAGA todos os insumos, preparos, produtos, embalagens e categorias antes de aplicar.'
                    : 'O kit será adicionado AOS dados existentes (nada é apagado).'}
                </Text>
              </View>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.aplicarBtn, loading && { opacity: 0.6 }]}
            onPress={aplicarKit}
            disabled={loading}
            accessibilityRole="button"
            accessibilityState={{ disabled: loading, busy: loading }}
            accessibilityLabel={
              loading
                ? 'Aplicando kit, aguarde'
                : selected === 'outro'
                  ? 'Começar do zero'
                  : `Aplicar Kit ${segmentoInfo?.label || ''}`.trim()
            }
          >
            {loading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Feather name={selected === 'outro' ? 'arrow-right' : 'download'} size={18} color="#fff" />
                <Text style={styles.aplicarBtnText}>
                  {selected === 'outro' ? 'Começar do zero' : `Aplicar Kit ${segmentoInfo?.label}`}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* Sessão 28.9 — Modal de progresso da aplicação do kit */}
      <Modal visible={!!progressStep} transparent animationType="fade">
        <View style={styles.progressOverlay}>
          <View style={styles.progressCard}>
            {progressStep === 'sucesso' ? (
              <>
                <View style={styles.progressIconCircle}>
                  <Feather name="check" size={28} color="#fff" />
                </View>
                <Text style={styles.progressTitle}>Kit aplicado!</Text>
                <Text style={styles.progressMsg}>{progressMsg}</Text>
                <View style={styles.progressStats}>
                  <View style={styles.progressStat}>
                    <Text style={styles.progressStatNum}>{progressCount.insumos}</Text>
                    <Text style={styles.progressStatLabel}>Insumos</Text>
                  </View>
                  {progressCount.embalagens > 0 && (
                    <View style={styles.progressStat}>
                      <Text style={styles.progressStatNum}>{progressCount.embalagens}</Text>
                      <Text style={styles.progressStatLabel}>Embalagens</Text>
                    </View>
                  )}
                  {progressCount.preparos > 0 && (
                    <View style={styles.progressStat}>
                      <Text style={styles.progressStatNum}>{progressCount.preparos}</Text>
                      <Text style={styles.progressStatLabel}>Preparos</Text>
                    </View>
                  )}
                  {progressCount.produtos > 0 && (
                    <View style={styles.progressStat}>
                      <Text style={styles.progressStatNum}>{progressCount.produtos}</Text>
                      <Text style={styles.progressStatLabel}>Produtos</Text>
                    </View>
                  )}
                </View>
                {/* Aviso forte: precisa atualizar preços */}
                <View style={styles.sucessoWarning}>
                  <Feather name="alert-triangle" size={16} color="#B45309" />
                  <Text style={styles.sucessoWarningText}>
                    <Text style={{ fontFamily: fontFamily.bold }}>Próximo passo:</Text>{' '}
                    abra cada insumo e cadastre o valor pago real do seu fornecedor. Sem isso, custos e margens vão ficar zerados.
                  </Text>
                </View>

                {/* CTAs explícitos — user TEM que clicar (não auto-fecha) */}
                <View style={styles.sucessoActions}>
                  <TouchableOpacity
                    style={styles.sucessoBtnSecondary}
                    onPress={() => { setProgressStep(null); navegarAposKit(); }}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.sucessoBtnSecondaryText}>Depois</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.sucessoBtnPrimary}
                    onPress={() => {
                      setProgressStep(null);
                      // Vai pra Insumos pra atualizar preços
                      try {
                        const parent = navigation.getParent();
                        const tabNav = parent?.getParent?.() || parent;
                        if (tabNav) tabNav.navigate('Insumos');
                        else navegarAposKit();
                      } catch { navegarAposKit(); }
                    }}
                    activeOpacity={0.7}
                  >
                    <Feather name="edit-3" size={14} color="#fff" />
                    <Text style={styles.sucessoBtnPrimaryText}>Atualizar preços agora</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                <ActivityIndicator color={colors.primary} size="large" />
                <Text style={styles.progressTitle}>
                  Aplicando Kit {segmentoInfo?.label || ''}
                </Text>
                <Text style={styles.progressMsg}>{progressMsg}</Text>
                <View style={styles.progressSteps}>
                  {[
                    { key: 'limpando',    label: 'Limpando dados antigos' },
                    { key: 'categorias',  label: 'Cadastrando categorias' },
                    { key: 'insumos',     label: 'Cadastrando insumos' },
                    { key: 'embalagens',  label: 'Cadastrando embalagens' },
                    { key: 'preparos',    label: 'Cadastrando preparos' },
                    { key: 'produtos',    label: 'Cadastrando produtos' },
                    { key: 'finalizando', label: 'Finalizando' },
                  ].map((step) => {
                    const order = ['iniciando','limpando','categorias','insumos','embalagens','preparos','produtos','finalizando','sucesso'];
                    const currentIdx = order.indexOf(progressStep);
                    const stepIdx = order.indexOf(step.key);
                    const isDone = stepIdx < currentIdx;
                    const isActive = stepIdx === currentIdx;
                    return (
                      <View key={step.key} style={styles.progressStepRow}>
                        <View style={[
                          styles.progressStepDot,
                          isDone && styles.progressStepDotDone,
                          isActive && styles.progressStepDotActive,
                        ]}>
                          {isDone ? (
                            <Feather name="check" size={10} color="#fff" />
                          ) : isActive ? (
                            <View style={styles.progressStepInner} />
                          ) : null}
                        </View>
                        <Text style={[
                          styles.progressStepLabel,
                          (isDone || isActive) && styles.progressStepLabelActive,
                        ]}>
                          {step.label}
                        </Text>
                      </View>
                    );
                  })}
                </View>
                <Text style={styles.progressHint}>Não feche o app. Isso leva poucos segundos.</Text>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, maxWidth: 960, alignSelf: 'center', width: '100%', paddingBottom: 220 },
  stickyFooter: {
    position: 'absolute', left: 0, right: 0,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: 1, borderTopColor: colors.border,
    shadowColor: colors.shadow, shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 4,
  },
  backBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: spacing.sm, paddingHorizontal: 2,
    marginBottom: spacing.xs, alignSelf: 'flex-start',
  },
  backBtnText: { fontSize: fonts.regular, fontFamily: fontFamily.semiBold, color: colors.primary },

  // Sessão 28.9 — Header alinhado com padrão dos modais novos (icon circle à esquerda + texto)
  pageHeader: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    marginBottom: spacing.md,
  },
  pageHeaderIcon: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.primary + '12',
    alignItems: 'center', justifyContent: 'center',
  },
  pageHeaderTitle: {
    fontSize: fonts.title, fontFamily: fontFamily.bold,
    color: colors.text,
  },
  pageHeaderDesc: {
    fontSize: fonts.small, fontFamily: fontFamily.regular,
    color: colors.textSecondary, lineHeight: 18, marginTop: 2,
  },

  warningCard: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#FFF3E0',
    borderLeftWidth: 3, borderLeftColor: colors.warning,
    borderRadius: borderRadius.sm,
    padding: spacing.sm, marginBottom: spacing.md,
  },
  warningText: { flex: 1, fontSize: fonts.tiny, fontFamily: fontFamily.medium, color: '#BF360C', lineHeight: 16 },

  sectionLabel: {
    fontSize: fonts.tiny, fontFamily: fontFamily.semiBold,
    color: colors.textSecondary, textTransform: 'uppercase',
    marginBottom: spacing.xs, marginTop: spacing.xs, letterSpacing: 0.4,
  },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: spacing.lg },
  segCard: {
    width: '48%', minWidth: 150,
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md, padding: 10,
    borderWidth: 1, borderColor: colors.border,
    position: 'relative',
  },
  segCardSelected: { borderColor: colors.primary, borderWidth: 2, backgroundColor: colors.primary + '05' },
  segIconCircle: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.primary + '12',
    alignItems: 'center', justifyContent: 'center',
  },
  segIconCircleSelected: { backgroundColor: colors.primary },
  segLabel: { fontSize: fonts.small, fontFamily: fontFamily.semiBold, fontWeight: '600', color: colors.text },
  segLabelSelected: { color: colors.primary },
  segDesc: { fontSize: 11, fontFamily: fontFamily.regular, color: colors.textSecondary, marginTop: 1 },
  segCheckCircle: {
    position: 'absolute', top: 8, right: 8,
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  segBadgeFull: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8,
    backgroundColor: colors.success,
    alignSelf: 'flex-start', marginTop: 4,
  },
  segBadgeFullText: {
    fontSize: 9, color: '#fff',
    fontFamily: fontFamily.semiBold, fontWeight: '700',
  },

  previewCard: {
    backgroundColor: colors.surface, borderRadius: borderRadius.lg,
    padding: spacing.md, borderWidth: 1, borderColor: colors.border,
    marginBottom: spacing.md,
  },
  previewTitle: { fontSize: fonts.regular, fontFamily: fontFamily.bold, color: colors.text, marginBottom: spacing.sm },
  previewRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.sm },
  previewItem: { flex: 1, alignItems: 'center', backgroundColor: colors.background, borderRadius: borderRadius.sm, padding: spacing.sm },
  previewNumber: { fontSize: fonts.title, fontFamily: fontFamily.bold, color: colors.primary },
  previewLabel: { fontSize: 12, color: colors.textSecondary, fontFamily: fontFamily.medium },
  previewHint: { fontSize: 12, color: colors.textSecondary, fontStyle: 'italic', marginBottom: spacing.sm },

  // Aviso forte de preços zerados (na tela do kit antes de aplicar)
  precoZeroWarning: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: '#FEF3C7',
    borderLeftWidth: 3, borderLeftColor: '#F59E0B',
    borderRadius: borderRadius.sm,
    padding: spacing.sm,
    marginTop: spacing.sm, marginBottom: spacing.xs,
  },
  precoZeroTitle: {
    fontSize: fonts.small, fontFamily: fontFamily.bold,
    color: '#B45309', marginBottom: 2,
  },
  precoZeroDesc: {
    fontSize: fonts.tiny, fontFamily: fontFamily.medium,
    color: '#92400E', lineHeight: 16,
  },

  previewList: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm, marginTop: spacing.xs },
  previewListTitle: {
    fontSize: fonts.tiny, fontFamily: fontFamily.semiBold,
    color: colors.textSecondary, textTransform: 'uppercase',
    marginBottom: 4, letterSpacing: 0.4,
  },
  previewListItem: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border + '40',
  },
  previewListName: { fontSize: fonts.small, color: colors.text, flex: 1 },
  previewListPrice: { fontSize: fonts.small, fontFamily: fontFamily.semiBold, color: colors.primary },

  aplicarBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: colors.primary, borderRadius: borderRadius.md,
    paddingVertical: 14, minHeight: 48,
  },
  aplicarBtnText: { fontSize: fonts.regular, fontFamily: fontFamily.bold, color: '#fff' },

  // Sessão 28.9 — Modal de progresso da aplicação do kit
  progressOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center', padding: spacing.md,
  },
  progressCard: {
    width: '100%', maxWidth: 380,
    backgroundColor: colors.surface, borderRadius: borderRadius.lg,
    padding: spacing.lg, alignItems: 'center',
    ...Platform.select({
      web: { boxShadow: '0 20px 60px rgba(0,0,0,0.25)' },
      default: { elevation: 16 },
    }),
  },
  progressIconCircle: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: colors.success,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  progressTitle: {
    fontSize: fonts.title, fontFamily: fontFamily.bold,
    color: colors.text, marginTop: spacing.sm, textAlign: 'center',
  },
  progressMsg: {
    fontSize: fonts.small, fontFamily: fontFamily.medium,
    color: colors.textSecondary, marginTop: 4, textAlign: 'center',
  },
  progressSteps: {
    width: '100%', marginTop: spacing.lg, gap: 10,
  },
  progressStepRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  progressStepDot: {
    width: 18, height: 18, borderRadius: 9,
    borderWidth: 2, borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center', justifyContent: 'center',
  },
  progressStepDotDone: {
    backgroundColor: colors.success, borderColor: colors.success,
  },
  progressStepDotActive: {
    borderColor: colors.primary,
  },
  progressStepInner: {
    width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary,
  },
  progressStepLabel: {
    fontSize: fonts.small, fontFamily: fontFamily.regular,
    color: colors.textSecondary,
  },
  progressStepLabelActive: {
    color: colors.text, fontFamily: fontFamily.semiBold, fontWeight: '600',
  },
  progressHint: {
    fontSize: 11, color: colors.textSecondary,
    fontStyle: 'italic', marginTop: spacing.md, textAlign: 'center',
  },
  progressStats: {
    flexDirection: 'row', gap: spacing.md, marginTop: spacing.md,
  },
  progressStat: {
    minWidth: 80, alignItems: 'center',
    backgroundColor: colors.background, borderRadius: borderRadius.md,
    paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
  },
  progressStatNum: {
    fontSize: fonts.title, fontFamily: fontFamily.bold,
    color: colors.primary,
  },
  progressStatLabel: {
    fontSize: 11, color: colors.textSecondary, fontFamily: fontFamily.medium,
  },
  // Aviso pós-sucesso: precisa atualizar preços
  sucessoWarning: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: '#FEF3C7',
    borderLeftWidth: 3, borderLeftColor: '#F59E0B',
    borderRadius: borderRadius.sm,
    padding: spacing.sm,
    marginTop: spacing.md,
    width: '100%',
  },
  sucessoWarningText: {
    flex: 1,
    fontSize: fonts.tiny, color: '#92400E',
    fontFamily: fontFamily.medium,
    lineHeight: 16,
  },
  sucessoActions: {
    flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md, width: '100%',
  },
  sucessoBtnSecondary: {
    flex: 1,
    paddingVertical: 12, borderRadius: borderRadius.md,
    borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  sucessoBtnSecondaryText: {
    fontSize: fonts.small, fontFamily: fontFamily.semiBold,
    color: colors.textSecondary,
  },
  sucessoBtnPrimary: {
    flex: 2,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 12, borderRadius: borderRadius.md,
    backgroundColor: colors.primary,
  },
  sucessoBtnPrimaryText: {
    fontSize: fonts.small, fontFamily: fontFamily.bold,
    color: '#fff',
  },
});
