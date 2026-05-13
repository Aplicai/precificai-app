import React, { useState } from 'react';
import Constants from 'expo-constants';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert, Platform, Switch } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { getDatabase } from '../database/database';
import { colors, spacing, fonts, fontFamily, borderRadius } from '../utils/theme';
import useListDensity from '../hooks/useListDensity';
import useFeatureFlag from '../hooks/useFeatureFlag';
// Sistema de feature flags por email (whitelist) — features beta/sistema.
import useFeatureFlags from '../hooks/useFeatureFlags';
import usePersistedState from '../hooks/usePersistedState';
// D-02: botão sair da conta no mobile
import { useAuth } from '../contexts/AuthContext';
// Sessão 28.63: botão de instalar PWA (reentrada manual depois de desinstalar).
import InstallAppButton from '../components/InstallAppButton';

// Versão dinâmica via expoConfig (em vez de hardcoded — evita desync após release).
const APP_VERSION = Constants?.expoConfig?.version || Constants?.manifest?.version || '1.0.0';

// Sessão 28.48: removido mapBackupError (helper só do JSON backup, agora extinto).

const OPCOES = [
  { key: 'perfil', icon: 'user', label: 'Perfil do Negócio', desc: 'Nome, segmento e telefone', screen: 'Perfil', color: colors.primary },
  { key: 'conta', icon: 'lock', label: 'Conta e Segurança', desc: 'Alterar e-mail e senha', screen: 'ContaSeguranca', color: colors.blue },
  { key: 'kitinicio', icon: 'gift', label: 'Kit de Início', desc: 'Trocar segmento e insumos pré-cadastrados', screen: 'KitInicio', color: colors.coral },
  { key: 'sobre', icon: 'info', label: 'Sobre o App', desc: 'Versão e informações', screen: 'Sobre', color: colors.accent },
  { key: 'termos', icon: 'file-text', label: 'Termos de Uso', desc: 'Condições de uso do aplicativo', screen: 'Termos', color: colors.primary },
  { key: 'privacidade', icon: 'shield', label: 'Política de Privacidade', desc: 'Como tratamos seus dados (LGPD)', screen: 'Privacidade', color: colors.accent },
];

// Sessão 28.48: removido BACKUP_TABLES (era usado só pelo backup JSON, agora removido).

/**
 * Linha de toggle de feature flag — usado na seção "Recursos avançados".
 * Mantém visual coerente com as demais linhas (icon box + label/desc + control à direita).
 */
function FlagToggleRow({ icon, materialIcon, label, desc, value, onChange }) {
  const Icon = materialIcon ? MaterialCommunityIcons : Feather;
  // Sessão 28.16: BUG FIX — antes a TouchableOpacity envolvendo o row chamava onChange(!value)
  // junto com o Switch.onValueChange — no mobile o tap no switch dispara AMBOS, gerando
  // duplo-toggle (volta pro estado anterior). Agora a row é só layout (View), e o
  // toggle acontece SÓ pelo Switch (e pelo body Touchable que faz tap-na-label).
  return (
    <View style={styles.flagRow} accessibilityRole="switch" accessibilityLabel={label} accessibilityState={{ checked: !!value }}>
      <View style={[styles.flagIconBox, { backgroundColor: (value ? colors.primary : colors.textSecondary) + '12' }]}>
        <Icon name={icon} size={18} color={value ? colors.primary : colors.textSecondary} />
      </View>
      <TouchableOpacity
        style={styles.rowBody}
        activeOpacity={0.7}
        onPress={() => onChange(!value)}
        accessibilityRole="button"
        accessibilityLabel={`Alternar ${label}`}
      >
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowDesc}>{desc}</Text>
      </TouchableOpacity>
      <Switch
        value={!!value}
        onValueChange={onChange}
        trackColor={{ false: colors.border, true: colors.primary }}
        thumbColor={Platform.OS === 'android' ? (value ? colors.primary : '#f4f3f4') : undefined}
        ios_backgroundColor={colors.border}
      />
    </View>
  );
}

export default function ConfiguracoesScreen({ navigation }) {
  const { density, setDensity } = useListDensity();
  // D-02: signOut function pra botão sair da conta
  const { signOut, user } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  async function handleLogout() {
    if (signingOut) return;
    const confirmar = Platform.OS === 'web'
      ? window.confirm('Sair da sua conta?')
      : await new Promise(resolve => Alert.alert(
          'Sair da conta',
          'Tem certeza que quer sair? Seus dados ficam salvos e você pode entrar de novo a qualquer momento.',
          [
            { text: 'Cancelar', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Sair', style: 'destructive', onPress: () => resolve(true) },
          ]
        ));
    if (!confirmar) return;
    setSigningOut(true);
    try { await signOut(); } catch (e) {
      console.error('[ConfiguracoesScreen.handleLogout]', e);
      setSigningOut(false);
    }
  }
  // Sessão 26: feature flags do modo avançado.
  const [estoqueOn, setEstoqueOn] = useFeatureFlag('modo_avancado_estoque');
  const [analiseOn, setAnaliseOn] = useFeatureFlag('modo_avancado_analise');
  const [deliveryOn, setDeliveryOn] = useFeatureFlag('usa_delivery');
  // Sessão 28.8 — flag opcional pra exibir o CRUD de combos sem depender de delivery
  const [combosOn, setCombosOn] = useFeatureFlag('modo_avancado_combos');

  // Feature flags SISTEMA (whitelist por email) — controla visibilidade de
  // features beta. O toggle local (AsyncStorage) só aparece para quem tem o
  // flag; só quem ativa o toggle vê o item de menu em "Mais".
  const featureFlags = useFeatureFlags();
  const [dreActive, setDreActive] = usePersistedState('feature_dre_fluxo_caixa_active', false);

  // Sessão 28.48: removidas funções pedirConfirmacaoExport, exportBackup,
  // mapBackupError, BACKUP_TABLES, isMountedRef e estado `exporting`.
  // Eram do backup JSON que o user pediu pra remover. Mantém só o CSV inline
  // mais abaixo na seção "Exportar Dados".

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.subtitle}>Ajustes gerais do aplicativo</Text>

      {/* Sessão 28.63: botão manual de instalar/reinstalar PWA.
          Só renderiza no web; em iOS/Android nativo o próprio componente
          retorna null (já existe app nativo). Posicionado no topo porque
          esse é justamente o problema que o user reportou — não achava
          como reinstalar depois de desinstalar. */}
      {Platform.OS === 'web' && <InstallAppButton />}

      {OPCOES.map((op) => (
        <TouchableOpacity
          key={op.key}
          style={styles.row}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          onPress={() => {
            if (op.screen) {
              navigation.navigate(op.screen);
            } else {
              Alert.alert(op.label, 'Em breve!');
            }
          }}
        >
          <View style={[styles.iconBox, { backgroundColor: (op.color || colors.primary) + '12' }]}>
            <Feather name={op.icon} size={18} color={op.color || colors.primary} />
          </View>
          <View style={styles.rowBody}>
            <Text style={styles.rowLabel}>{op.label}</Text>
            <Text style={styles.rowDesc}>{op.desc}</Text>
          </View>
          <Feather name="chevron-right" size={18} color={colors.disabled} />
        </TouchableOpacity>
      ))}

      {/* Aparência: densidade das listas
          Sessão 28.6 — toggle reformulado: compact agora é o padrão mobile real.
          Sub-labels deixam claro qual é o default por plataforma; helper text
          abaixo explica o impacto visual da escolha. Preview row mostra ao vivo
          a diferença de tamanho. Default por plataforma vale só na 1ª execução
          (depois respeita preferência persistida em AsyncStorage — ver useListDensity). */}
      <View style={styles.aparenciaSection}>
        <View style={styles.backupHeader}>
          <View style={[styles.iconBox, { backgroundColor: colors.purple + '12' }]}>
            <Feather name="layout" size={18} color={colors.purple} />
          </View>
          <View style={styles.rowBody}>
            <Text style={styles.rowLabel}>Aparência</Text>
            <Text style={styles.rowDesc}>Densidade das listas (Insumos, Produtos, etc.)</Text>
          </View>
        </View>
        <View style={styles.densityRow}>
          <TouchableOpacity
            onPress={() => setDensity('compact')}
            activeOpacity={0.7}
            style={[
              styles.densityBtn,
              density === 'compact' && styles.densityBtnActive,
            ]}
            accessibilityRole="radio"
            accessibilityLabel="Densidade compacta"
            accessibilityHint="Mais denso, padrão mobile"
            accessibilityState={{ selected: density === 'compact' }}
          >
            <Feather
              name="align-justify"
              size={18}
              color={density === 'compact' ? colors.primary : colors.textSecondary}
            />
            <Text style={[
              styles.densityBtnText,
              density === 'compact' && styles.densityBtnTextActive,
            ]}>Compacto</Text>
            <Text style={[
              styles.densityBtnSubText,
              density === 'compact' && styles.densityBtnSubTextActive,
            ]}>mais denso, padrão mobile</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setDensity('comfortable')}
            activeOpacity={0.7}
            style={[
              styles.densityBtn,
              density === 'comfortable' && styles.densityBtnActive,
            ]}
            accessibilityRole="radio"
            accessibilityLabel="Densidade confortável"
            accessibilityHint="Mais ar, padrão desktop"
            accessibilityState={{ selected: density === 'comfortable' }}
          >
            <Feather
              name="menu"
              size={18}
              color={density === 'comfortable' ? colors.primary : colors.textSecondary}
            />
            <Text style={[
              styles.densityBtnText,
              density === 'comfortable' && styles.densityBtnTextActive,
            ]}>Confortável</Text>
            <Text style={[
              styles.densityBtnSubText,
              density === 'comfortable' && styles.densityBtnSubTextActive,
            ]}>mais ar, padrão desktop</Text>
          </TouchableOpacity>
        </View>

        {/* Preview row — exemplo ao vivo de uma linha de lista no modo escolhido.
            Usa os mesmos tokens do hook (rowMinHeight + paddingVertical + fontSize),
            então reflete exatamente o que o usuário verá em Insumos/Produtos. */}
        <Text style={styles.densityPreviewLabel}>Pré-visualização</Text>
        <View style={styles.densityPreviewBox}>
          <View
            style={[
              styles.densityPreviewRow,
              {
                minHeight: density === 'compact' ? 48 : 60,
                paddingVertical: density === 'compact' ? 8 : 14,
              },
            ]}
          >
            <View
              style={[
                styles.densityPreviewAvatar,
                {
                  width: density === 'compact' ? 32 : 44,
                  height: density === 'compact' ? 32 : 44,
                },
              ]}
            >
              <Feather
                name="package"
                size={density === 'compact' ? 16 : 20}
                color={colors.primary}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text
                style={[
                  styles.densityPreviewTitle,
                  { fontSize: density === 'compact' ? 13 : 15 },
                ]}
                numberOfLines={1}
              >
                Tomate italiano
              </Text>
              <Text
                style={[
                  styles.densityPreviewSubtitle,
                  { fontSize: density === 'compact' ? 11 : 13 },
                ]}
                numberOfLines={1}
              >
                R$ 8,50 / kg
              </Text>
            </View>
          </View>
        </View>

        {/* Helper inline — explica impacto da escolha em PT-BR.
            Mantém o usuário ciente de que a escolha vale para todo o app. */}
        <Text style={styles.densityHelper}>
          O modo compacto deixa mais conteúdo visível e é o padrão recomendado no celular. O confortável dá mais espaço para leitura, ideal em tablets e desktop.
        </Text>
      </View>

      {/* Recursos avançados — flags que ligam módulos opcionais */}
      <View style={styles.advancedSection}>
        <View style={styles.backupHeader}>
          <View style={[styles.iconBox, { backgroundColor: colors.coral + '12' }]}>
            <Feather name="sliders" size={18} color={colors.coral} />
          </View>
          <View style={styles.rowBody}>
            <Text style={styles.rowLabel}>Recursos avançados</Text>
            <Text style={styles.rowDesc}>Ative módulos extras conforme sua operação</Text>
          </View>
        </View>

        {/* Sessão 27 — Toggle de "Controle de estoque" oculto a pedido do usuário.
            UX não fechou (botões pequenos, navegação confusa). Código continua
            no repo (FABMenu, EntradaEstoque, AjusteEstoque, services/estoque)
            para reativação futura — basta descomentar este bloco. */}
        {false && (
          <FlagToggleRow
            icon="package"
            label="Controle de estoque"
            desc="Saldos, entradas, ajustes e alertas de estoque baixo nos insumos"
            value={estoqueOn}
            onChange={setEstoqueOn}
          />
        )}
        <FlagToggleRow
          icon="moped-outline"
          materialIcon
          label="Trabalha com delivery"
          desc="Mostra Delivery e Combos"
          value={deliveryOn}
          onChange={setDeliveryOn}
        />
        <FlagToggleRow
          icon="bar-chart-2"
          label="Análise avançada"
          desc="Ranking de Produtos (BCG), Margem Crítica, Comparador de Fornecedores. Parâmetros configuráveis no Painel."
          value={analiseOn}
          onChange={setAnaliseOn}
        />
        {/* APP-46 — quando análise avançada ativa, atalho pra ajustar parâmetros */}
        {analiseOn && (
          <View style={{ marginLeft: 36, marginTop: -6, marginBottom: 8 }}>
            <Text style={{ fontSize: 11, color: colors.textSecondary, lineHeight: 14 }}>
              💡 Ajuste os limites no Painel: clique em qualquer KPI (CMV, Margem Líquida) pra abrir o modal e mudar a meta.
            </Text>
          </View>
        )}
        <FlagToggleRow
          icon="layers"
          label="Combos / Kits"
          desc="Vender pacotes de produtos juntos (ex: combo executivo, kit lanche, café da manhã)"
          value={combosOn}
          onChange={setCombosOn}
        />
      </View>

      {/* Recursos Beta — só aparece pra emails com whitelist (featureFlags.dreFluxoCaixa).
          Toggle local controla se o item de menu correspondente em "Mais" fica visível.
          Quem NÃO tem o flag não vê NEM essa seção NEM o item de menu. */}
      {featureFlags.dreFluxoCaixa && (
        <View style={styles.advancedSection}>
          <View style={styles.backupHeader}>
            <View style={[styles.iconBox, { backgroundColor: colors.accent + '12' }]}>
              <Feather name="zap" size={18} color={colors.accent} />
            </View>
            <View style={styles.rowBody}>
              <Text style={styles.rowLabel}>Recursos Beta</Text>
              <Text style={styles.rowDesc}>Funcionalidades em teste. Liberadas individualmente por e-mail.</Text>
            </View>
          </View>
          <FlagToggleRow
            icon="trending-up"
            label="Fluxo de Caixa + DRE"
            desc="Inclui controle de entradas/saídas mensais e demonstração de resultados."
            value={dreActive}
            onChange={setDreActive}
          />
        </View>
      )}

      {/* Sessão 28.48: "Backup e Restauração" simplificado.
          Removidos os botões "Exportar Dados" (JSON) e "Importar Dados" (em breve).
          Mantido só o "Exportar CSV". Renomeada a seção pra "Exportar Dados". */}
      <View style={styles.backupSection}>
        <View style={styles.backupHeader}>
          <View style={[styles.iconBox, { backgroundColor: colors.blue + '12' }]}>
            <Feather name="file-text" size={18} color={colors.blue} />
          </View>
          <View style={styles.rowBody}>
            <Text style={styles.rowLabel}>Exportar Dados</Text>
            <Text style={styles.rowDesc}>Baixe um CSV com tudo cadastrado pra Excel / contador</Text>
          </View>
        </View>

        {/* Export CSV — Sessão 28.20 / mantido na 28.48 como única opção */}
        <TouchableOpacity
          style={[styles.backupBtn]}
          activeOpacity={0.7}
          onPress={async () => {
            try {
              const { isCsvExportSupported } = await import('../utils/exportCsv');
              if (!isCsvExportSupported()) {
                Alert.alert('Export CSV', 'Disponível só no navegador. Acesse pelo computador pra baixar.');
                return;
              }
              const db = await getDatabase();
              // Sessão 28.23 BUG FIX: ANTES tentava baixar 7 arquivos sequenciais,
              // mas o navegador bloqueia downloads automáticos múltiplos. Solução:
              // bundle TUDO em UM CSV com seções separadas por cabeçalho.
              const sections = [
                {
                  titulo: 'INSUMOS',
                  query: 'SELECT id, nome, marca, quantidade_bruta, quantidade_liquida, fator_correcao, unidade_medida, valor_pago, preco_por_kg FROM materias_primas ORDER BY nome',
                  headers: ['ID','Nome','Marca','Qtd. Bruta','Qtd. Líquida','FC','Unidade','Valor pago (R$)','Preço base (R$)'],
                  keys: ['id','nome','marca','quantidade_bruta','quantidade_liquida','fator_correcao','unidade_medida','valor_pago','preco_por_kg'],
                },
                {
                  titulo: 'PRODUTOS',
                  query: 'SELECT id, nome, preco_venda, margem_lucro_produto, rendimento_total, unidade_rendimento, validade_dias, modo_preparo FROM produtos ORDER BY nome',
                  headers: ['ID','Nome','Preço venda (R$)','Margem (%)','Rendimento','Unidade venda','Validade (dias)','Modo de preparo'],
                  keys: ['id','nome','preco_venda','margem_lucro_produto','rendimento_total','unidade_rendimento','validade_dias','modo_preparo'],
                },
                {
                  titulo: 'PREPAROS',
                  query: 'SELECT id, nome, rendimento_total, unidade_medida, custo_total, custo_por_kg, validade_dias FROM preparos ORDER BY nome',
                  headers: ['ID','Nome','Rendimento','Unidade','Custo total (R$)','Custo/kg (R$)','Validade (dias)'],
                  keys: ['id','nome','rendimento_total','unidade_medida','custo_total','custo_por_kg','validade_dias'],
                },
                {
                  titulo: 'EMBALAGENS',
                  query: 'SELECT id, nome, quantidade, preco_total, preco_unitario FROM embalagens ORDER BY nome',
                  headers: ['ID','Nome','Qtd. pacote','Preço total (R$)','Preço unitário (R$)'],
                  keys: ['id','nome','quantidade','preco_total','preco_unitario'],
                },
                {
                  titulo: 'VENDAS',
                  query: 'SELECT v.id, v.data, p.nome as produto_nome, v.quantidade FROM vendas v LEFT JOIN produtos p ON p.id = v.produto_id ORDER BY v.data DESC',
                  headers: ['ID','Data','Produto','Quantidade'],
                  keys: ['id','data','produto_nome','quantidade'],
                },
                {
                  titulo: 'DESPESAS FIXAS',
                  query: 'SELECT id, descricao, valor FROM despesas_fixas ORDER BY descricao',
                  headers: ['ID','Descrição','Valor (R$)'],
                  keys: ['id','descricao','valor'],
                },
                {
                  titulo: 'DESPESAS VARIÁVEIS',
                  query: 'SELECT id, descricao, percentual FROM despesas_variaveis ORDER BY descricao',
                  headers: ['ID','Descrição','% faturamento'],
                  keys: ['id','descricao','percentual'],
                },
                {
                  titulo: 'PRECOS POR PLATAFORMA DELIVERY',
                  query: 'SELECT ppd.id, p.nome as produto, dc.plataforma, ppd.preco_venda FROM produto_preco_delivery ppd LEFT JOIN produtos p ON p.id = ppd.produto_id LEFT JOIN delivery_config dc ON dc.id = ppd.plataforma_id ORDER BY p.nome, dc.plataforma',
                  headers: ['ID','Produto','Plataforma','Preço cobrado (R$)'],
                  keys: ['id','produto','plataforma','preco_venda'],
                },
              ];
              // Helper pra escapar célula CSV (separador ; pt-BR, BOM UTF-8)
              const esc = (v) => {
                if (v === null || v === undefined) return '';
                let s;
                if (typeof v === 'number') s = String(v).replace('.', ',');
                else s = String(v);
                if (/[;,"\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
                return s;
              };
              let csv = '﻿'; // BOM pra Excel BR detectar UTF-8
              let secoesNaoVazias = 0;
              for (const sec of sections) {
                try {
                  const data = await db.getAllAsync(sec.query);
                  if (!data || data.length === 0) continue;
                  secoesNaoVazias++;
                  csv += `\n=== ${sec.titulo} ===\n`;
                  csv += sec.headers.map(esc).join(';') + '\n';
                  for (const row of data) {
                    csv += sec.keys.map(k => esc(row[k])).join(';') + '\n';
                  }
                  csv += '\n'; // linha vazia entre seções
                } catch (e) {
                  if (typeof console !== 'undefined') console.warn('[ConfiguracoesScreen.exportCSV]', sec.titulo, e?.message || e);
                }
              }
              if (secoesNaoVazias === 0) {
                Alert.alert('Sem dados', 'Não há dados pra exportar ainda. Cadastre insumos e produtos primeiro.');
                return;
              }
              // Download via blob URL
              const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
              const url = URL.createObjectURL(blob);
              const link = document.createElement('a');
              const dataStr = new Date().toISOString().slice(0, 10);
              link.href = url;
              link.download = `precificai-completo-${dataStr}.csv`;
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
              setTimeout(() => URL.revokeObjectURL(url), 1000);
              Alert.alert(
                'Exportado!',
                `Arquivo "precificai-completo-${dataStr}.csv" baixado com ${secoesNaoVazias} seção(ões):\n\n` +
                sections.map(s => `• ${s.titulo}`).join('\n') +
                `\n\nAbra no Excel ou Google Sheets. As seções estão separadas por linhas "=== TITULO ===" pra fácil identificação.`,
              );
            } catch (e) {
              console.error('[ConfiguracoesScreen.exportCSV]', e);
              Alert.alert('Erro', 'Não foi possível exportar CSV: ' + (e?.message || 'erro desconhecido'));
            }
          }}
          accessibilityRole="button"
          accessibilityLabel="Exportar CSV para Excel"
        >
          <Feather name="download" size={16} color="#fff" />
          <Text style={styles.backupBtnText}>Baixar CSV (Excel / contador)</Text>
        </TouchableOpacity>
      </View>

      {/* D-02: botão sair da conta */}
      <TouchableOpacity
        style={styles.logoutBtn}
        onPress={handleLogout}
        disabled={signingOut}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel="Sair da conta"
      >
        <Feather name="log-out" size={16} color={colors.error} style={{ marginRight: 8 }} />
        <Text style={styles.logoutBtnText}>{signingOut ? 'Saindo...' : 'Sair da conta'}</Text>
      </TouchableOpacity>
      {user?.email ? (
        <Text style={styles.loggedAs}>Conectado como {user.email}</Text>
      ) : null}

      <Text style={styles.version}>PrecificaApp v{APP_VERSION}</Text>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  // Sessão 28 — paddingBottom 40→100 para não ficar atrás do BottomTab (66pt)
  content: { padding: spacing.md, paddingBottom: 100, maxWidth: 600, width: '100%', alignSelf: 'center' },
  subtitle: { fontSize: fonts.small, color: colors.textSecondary, marginBottom: spacing.md, textAlign: 'center' },
  row: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md, marginBottom: spacing.sm,
    shadowColor: colors.shadow, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 4, elevation: 2,
  },
  iconBox: {
    width: 40, height: 40, borderRadius: borderRadius.md,
    backgroundColor: colors.inputBg, justifyContent: 'center', alignItems: 'center',
    marginRight: spacing.md,
  },
  icon: { fontSize: 18 },
  rowBody: { flex: 1 },
  rowLabel: { fontSize: fonts.regular, fontWeight: '700', color: colors.text, marginBottom: 2 },
  rowDesc: { fontSize: fonts.tiny, color: colors.textSecondary },
  chevron: { fontSize: 24, color: colors.disabled, marginLeft: spacing.sm },
  backupSection: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginTop: spacing.md,
    shadowColor: colors.shadow, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 4, elevation: 2,
  },
  backupHeader: {
    flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm,
  },
  backupDesc: {
    fontSize: fonts.tiny, color: colors.textSecondary, lineHeight: 18,
    marginBottom: spacing.md, marginLeft: 2,
  },
  backupBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.primary, borderRadius: borderRadius.md,
    paddingVertical: 12, marginBottom: spacing.sm,
  },
  backupBtnText: {
    fontSize: fonts.regular, fontWeight: '700', color: '#fff',
  },
  backupBtnOutline: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: 'transparent', borderRadius: borderRadius.md,
    paddingVertical: 12, borderWidth: 1.5, borderColor: colors.primary,
  },
  backupBtnOutlineText: {
    fontSize: fonts.regular, fontWeight: '700', color: colors.primary,
  },
  version: { fontSize: fonts.tiny, color: colors.disabled, textAlign: 'center', marginTop: spacing.lg },
  // D-02: botão sair da conta
  logoutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.error + '0F',
    borderWidth: 1, borderColor: colors.error + '40',
    borderRadius: borderRadius.md,
    paddingVertical: 14, paddingHorizontal: spacing.lg,
    marginTop: spacing.lg, marginBottom: spacing.sm,
    minHeight: 48,
  },
  logoutBtnText: {
    color: colors.error, fontFamily: fontFamily.bold,
    fontSize: fonts.regular, fontWeight: '700',
  },
  loggedAs: {
    fontSize: fonts.tiny, color: colors.textSecondary,
    textAlign: 'center', marginBottom: spacing.sm,
  },
  aparenciaSection: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginTop: spacing.md,
    shadowColor: colors.shadow, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 4, elevation: 2,
  },
  densityRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  densityBtn: {
    flex: 1,
    minHeight: 48,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.xs,
    borderRadius: borderRadius.md,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  densityBtnActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + '10',
  },
  densityBtnText: {
    marginTop: 4,
    fontSize: fonts.small,
    fontFamily: fontFamily.semiBold,
    color: colors.textSecondary,
  },
  densityBtnTextActive: {
    color: colors.primary,
  },
  densityBtnSubText: {
    marginTop: 2,
    fontSize: fonts.tiny,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  densityBtnSubTextActive: {
    color: colors.primary,
  },
  densityPreviewLabel: {
    marginTop: spacing.md,
    marginBottom: 6,
    fontSize: fonts.tiny,
    fontFamily: fontFamily.semiBold,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  densityPreviewBox: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border + '80',
    paddingHorizontal: spacing.sm,
  },
  densityPreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  densityPreviewAvatar: {
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary + '12',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  densityPreviewTitle: {
    fontFamily: fontFamily.semiBold,
    color: colors.text,
  },
  densityPreviewSubtitle: {
    color: colors.textSecondary,
    marginTop: 1,
  },
  densityHelper: {
    marginTop: spacing.sm,
    fontSize: fonts.tiny,
    lineHeight: 16,
    color: colors.textSecondary,
  },
  // Recursos avançados (Sessão 26)
  advancedSection: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginTop: spacing.md,
    shadowColor: colors.shadow, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 4, elevation: 2,
  },
  flagRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: spacing.sm + 2,
    borderTopWidth: 1, borderTopColor: colors.border + '60',
  },
  flagIconBox: {
    width: 36, height: 36, borderRadius: borderRadius.md,
    alignItems: 'center', justifyContent: 'center',
    marginRight: spacing.md,
  },
});
