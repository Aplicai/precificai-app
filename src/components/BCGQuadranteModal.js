/**
 * BCGQuadranteModal
 *
 * Modal pedagógico que explica em linguagem acessível o significado de cada
 * quadrante da Engenharia de Cardápio (Matriz BCG aplicada ao restaurante):
 *   - estrela    → alta margem + alta vendagem
 *   - vaca       → alta margem + baixa vendagem (Quebra-Cabeça/Aposta)
 *   - interrogacao → baixa margem + alta vendagem (Cavalo de Batalha/Mina)
 *   - abacaxi    → baixa margem + baixa vendagem
 *
 * Estrutura inspirada em InviabilidadeModal:
 *   header colorido + corpo seccionado (significado, dicas, exemplo) + botão fechar.
 *
 * Props:
 *   visible: boolean
 *   onClose: () => void
 *   quadrante: 'estrela' | 'vaca' | 'interrogacao' | 'abacaxi' | null
 */
import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
  Pressable,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, fonts, fontFamily, borderRadius } from '../utils/theme';

// Conteúdo pedagógico por quadrante. Cores e ícones alinhados ao mapa
// CLASSIFICATIONS de MatrizBCGScreen — mantém consistência visual.
const QUADRANTES = {
  estrela: {
    titulo: 'Estrela',
    emoji: '\u2B50',
    icon: 'star',
    color: '#D4A017',
    bg: '#FFF8E1',
    border: '#FFD700',
    significado:
      'Vendem muito E dão margem alta. São seus campeões: o cliente já gosta e cada venda gera bom lucro.',
    dicas: [
      'Mantenha a qualidade e o padrão — nunca quebre a expectativa do cliente.',
      'Não baixe o preço para "vender mais": o item já vende, foque em proteger a margem.',
      'Destaque no cardápio (foto, posição, descrição) e treine a equipe para sugerir.',
      'Acompanhe a concorrência para garantir que continua competitivo.',
    ],
    exemplo:
      'Ex.: o X-Bacon que sempre sai e tem boa margem — o "carro-chefe" da casa.',
  },
  vaca: {
    titulo: 'Vaca Leiteira',
    emoji: '\uD83D\uDC2E',
    icon: 'help-circle',
    color: '#1565C0',
    bg: '#E3F2FD',
    border: '#2196F3',
    significado:
      'Lucram bem por unidade, mas vendem pouco. Tem potencial não explorado — o cliente ainda não descobriu.',
    dicas: [
      'Crie combos juntando esses itens com produtos populares.',
      'Reposicione no cardápio (topo da seção, foto destacada, "sugestão do chef").',
      'Treine a equipe para sugerir ativamente no balcão e no delivery.',
      'Teste promoções pontuais para gerar experimentação.',
    ],
    exemplo:
      'Ex.: aquela sobremesa caseira que dá ótima margem mas quase ninguém pede.',
  },
  interrogacao: {
    titulo: 'Interrogação',
    emoji: '\u2753',
    icon: 'trending-up',
    color: '#388E3C',
    bg: '#E8F5E9',
    border: '#4CAF50',
    significado:
      'Vendem muito mas a margem está apertada. Atenção ao custo: pequenos aumentos no CMV podem zerar o lucro.',
    dicas: [
      'Revise o CMV: pese ingredientes e confira se a ficha técnica está real.',
      'Renegocie com fornecedor — volume alto dá poder de barganha.',
      'Avalie ajustar a porção (gramatura) sem comprometer a percepção do cliente.',
      'Considere aumento gradual de preço (5% costuma passar despercebido e dobra o lucro).',
    ],
    exemplo:
      'Ex.: o combo promocional que sai muito mas cada venda quase não sobra dinheiro.',
  },
  abacaxi: {
    titulo: 'Abacaxi',
    emoji: '\uD83C\uDF4D',
    icon: 'alert-triangle',
    color: '#C62828',
    bg: '#FFEBEE',
    border: '#F44336',
    significado:
      'Vendem pouco e dão pouco lucro. Ocupam espaço no cardápio, no estoque e na operação sem retorno proporcional.',
    dicas: [
      'Considere descontinuar — cardápio enxuto vende mais e simplifica a cozinha.',
      'OU reformule a receita para reduzir custo e aumentar margem.',
      'OU aproveite como item de combo/kit, agregando valor a outro produto.',
      'Avalie se ao menos cobre o custo fixo antes de manter por hábito.',
    ],
    exemplo:
      'Ex.: aquele prato antigo do cardápio que ninguém pede há meses e ainda tem ingrediente parado no estoque.',
  },
};

export default function BCGQuadranteModal({ visible, onClose, quadrante }) {
  // Guard clause: sem quadrante válido, renderiza apenas backdrop vazio.
  const data = quadrante ? QUADRANTES[quadrante] : null;

  if (!data) {
    return (
      <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
        <Pressable style={styles.backdrop} onPress={onClose} />
      </Modal>
    );
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={() => {}}>
          {/* Header colorido por quadrante */}
          <View style={[styles.header, { backgroundColor: data.bg, borderColor: data.border }]}>
            <View style={styles.titleRow}>
              <Text style={styles.emoji}>{data.emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.title, { color: data.color }]}>{data.titulo}</Text>
                <Text style={styles.subtitle}>Saiba como agir nesse quadrante</Text>
              </View>
              <Feather name={data.icon} size={22} color={data.color} />
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeIcon}
              hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
              accessibilityRole="button"
              accessibilityLabel="Fechar explicação do quadrante"
            >
              <Feather name="x" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={{ maxHeight: 480 }}
            contentContainerStyle={{ padding: spacing.md }}
          >
            {/* Significado */}
            <Text style={styles.sectionLabel}>O que significa</Text>
            <View style={[styles.significadoBox, { borderLeftColor: data.border }]}>
              <Text style={styles.significadoText}>{data.significado}</Text>
            </View>

            {/* Dicas práticas */}
            <Text style={styles.sectionLabel}>O que fazer</Text>
            <View style={{ marginBottom: spacing.md }}>
              {data.dicas.map((dica, idx) => (
                <View key={idx} style={styles.dicaRow}>
                  <View style={[styles.dicaBullet, { backgroundColor: data.color + '18' }]}>
                    <Text style={[styles.dicaBulletText, { color: data.color }]}>{idx + 1}</Text>
                  </View>
                  <Text style={styles.dicaText}>{dica}</Text>
                </View>
              ))}
            </View>

            {/* Exemplo de lanchonete/restaurante */}
            <View style={styles.exemploBox}>
              <Feather name="info" size={14} color={colors.textSecondary} />
              <Text style={styles.exemploText}>{data.exemplo}</Text>
            </View>

            <TouchableOpacity
              style={[styles.closeBtn, { backgroundColor: data.color }]}
              onPress={onClose}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Entendi, fechar"
            >
              <Text style={styles.closeBtnText}>Entendi</Text>
            </TouchableOpacity>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.md,
  },
  card: {
    width: '100%',
    maxWidth: 460,
    maxHeight: '90%',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    ...Platform.select({
      web: { boxShadow: '0 8px 24px rgba(0,0,0,0.18)' },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.18,
        shadowRadius: 12,
        elevation: 6,
      },
    }),
  },

  // Header
  header: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 2,
    position: 'relative',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingRight: 28, // espaço para o X
  },
  emoji: { fontSize: 28 },
  title: {
    fontSize: fonts.medium,
    fontFamily: fontFamily.bold,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: fonts.tiny,
    fontFamily: fontFamily.regular,
    color: colors.textSecondary,
    marginTop: 2,
  },
  closeIcon: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Sections
  sectionLabel: {
    fontSize: fonts.tiny,
    color: colors.textSecondary,
    fontFamily: fontFamily.semiBold,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 6,
  },

  // Significado
  significadoBox: {
    borderLeftWidth: 3,
    backgroundColor: colors.background,
    borderRadius: borderRadius.sm,
    padding: spacing.sm,
    marginBottom: spacing.md,
  },
  significadoText: {
    fontSize: fonts.small,
    fontFamily: fontFamily.regular,
    color: colors.text,
    lineHeight: 20,
  },

  // Dicas
  dicaRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingVertical: 6,
  },
  dicaBullet: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  dicaBulletText: {
    fontSize: 11,
    fontFamily: fontFamily.bold,
    fontWeight: '700',
  },
  dicaText: {
    flex: 1,
    fontSize: fonts.small,
    fontFamily: fontFamily.regular,
    color: colors.text,
    lineHeight: 19,
  },

  // Exemplo
  exemploBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    backgroundColor: colors.background,
    borderRadius: borderRadius.sm,
    padding: spacing.sm,
    marginBottom: spacing.md,
  },
  exemploText: {
    flex: 1,
    fontSize: fonts.tiny,
    fontFamily: fontFamily.regular,
    color: colors.textSecondary,
    fontStyle: 'italic',
    lineHeight: 16,
  },

  // Close button
  closeBtn: {
    paddingVertical: 12,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  closeBtnText: {
    color: '#fff',
    fontFamily: fontFamily.bold,
    fontWeight: '700',
    fontSize: fonts.regular,
  },
});
