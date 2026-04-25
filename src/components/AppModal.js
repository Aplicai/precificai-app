/**
 * Sprint 3 S1 — Componente `<AppModal>` único (audit M1-M7).
 *
 * MOTIVAÇÃO:
 * Coexistiam 4 padrões divergentes de modal:
 *   - ConfirmDeleteModal (centered, 340px, avisos vermelhos)
 *   - CurrencyInputModal (centered, 420px)
 *   - ModalFormWrapper (full-screen bottom-sheet no mobile)
 *   - 3 modais inline em HomeScreen (bottom-sheet diferente)
 * Resultado: tamanhos inconsistentes, animações diferentes, dismiss behavior
 * divergente, acessibilidade desigual, código duplicado em ~600 linhas.
 *
 * Este componente é a **base única** para novos modais. Os antigos continuam
 * funcionando — migração será incremental (quem tocar na tela migra o modal).
 *
 * USO BÁSICO:
 *   <AppModal visible onClose={closeFn} size="md" title="Editar preço">
 *     <Text>Conteúdo...</Text>
 *     <Button title="Salvar" onPress={...} />
 *   </AppModal>
 *
 * USO COM HEADER/BODY/FOOTER:
 *   <AppModal visible onClose={closeFn} size="lg">
 *     <AppModal.Header title="Resumo" onClose={closeFn} />
 *     <AppModal.Body>
 *       <ScrollView>...</ScrollView>
 *     </AppModal.Body>
 *     <AppModal.Footer>
 *       <Button title="Cancelar" variant="secondary" />
 *       <Button title="Confirmar" />
 *     </AppModal.Footer>
 *   </AppModal>
 *
 * TAMANHOS:
 *   sm = 420px  — confirmações, inputs simples
 *   md = 640px  — formulários curtos, detalhes
 *   lg = 900px  — listas, forms longos, desktop
 *
 * ACESSIBILIDADE:
 *   - accessibilityRole="dialog"
 *   - accessibilityViewIsModal (iOS screen reader foca dentro)
 *   - backdrop fecha (opt-out via dismissOnBackdrop={false})
 *   - ESC no web fecha (via Modal.onRequestClose)
 */

import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, fonts, fontFamily, borderRadius } from '../utils/theme';

const SIZE_MAP = Object.freeze({
  sm: 420,
  md: 640,
  lg: 900,
});

export default function AppModal({
  visible,
  onClose,
  size = 'md',
  title,
  dismissOnBackdrop = true,
  keyboardAvoiding = true,
  transparent = true,
  animationType = 'fade',
  children,
  contentStyle,
  testID,
}) {
  const maxWidth = SIZE_MAP[size] || SIZE_MAP.md;
  // Sessão UX — em telas estreitas (<= 480pt) modal vira bottom-sheet full-width
  // sem maxWidth e com radius só no topo. Telas <=360pt sem radius.
  const { width } = useWindowDimensions();
  const isMobile = width <= 480;
  const isTinyScreen = width <= 360;

  function handleBackdropPress() {
    if (dismissOnBackdrop && typeof onClose === 'function') onClose();
  }

  const mobileContentStyle = isMobile && {
    width: '100%',
    maxWidth: '100%',
    maxHeight: '90%',
    borderTopLeftRadius: isTinyScreen ? 0 : borderRadius.lg,
    borderTopRightRadius: isTinyScreen ? 0 : borderRadius.lg,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderRadius: 0,
    alignSelf: 'stretch',
  };

  const innerContent = (
    <TouchableWithoutFeedback onPress={() => {}}>
      <View
        style={[styles.content, { maxWidth }, mobileContentStyle, contentStyle]}
        accessible
        accessibilityRole="dialog"
        accessibilityViewIsModal
        accessibilityLabel={title}
        testID={testID}
      >
        {/* Header implícito quando usuário passa `title` mas não usa AppModal.Header */}
        {title != null && (
          <View style={styles.headerImplicit}>
            <Text style={styles.headerImplicitTitle} numberOfLines={2}>{title}</Text>
            {typeof onClose === 'function' && (
              <TouchableOpacity
                onPress={onClose}
                style={styles.closeBtn}
                accessibilityRole="button"
                accessibilityLabel="Fechar"
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Feather name="x" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            )}
          </View>
        )}
        {children}
      </View>
    </TouchableWithoutFeedback>
  );

  return (
    <Modal
      visible={visible}
      transparent={transparent}
      animationType={isMobile ? 'slide' : animationType}
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={handleBackdropPress}>
        <View style={[styles.overlay, isMobile && styles.overlayMobile]}>
          {keyboardAvoiding ? (
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              style={[styles.flexCenter, isMobile && styles.flexBottom]}
            >
              {innerContent}
            </KeyboardAvoidingView>
          ) : (
            innerContent
          )}
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

// Subcomponentes opcionais para composição mais explícita.
AppModal.Header = function AppModalHeader({ title, onClose, subtitle }) {
  return (
    <View style={styles.header}>
      <View style={{ flex: 1 }}>
        <Text style={styles.headerTitle} numberOfLines={2}>{title}</Text>
        {subtitle ? <Text style={styles.headerSubtitle}>{subtitle}</Text> : null}
      </View>
      {typeof onClose === 'function' && (
        <TouchableOpacity
          onPress={onClose}
          style={styles.closeBtn}
          accessibilityRole="button"
          accessibilityLabel="Fechar"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Feather name="x" size={20} color={colors.textSecondary} />
        </TouchableOpacity>
      )}
    </View>
  );
};

AppModal.Body = function AppModalBody({ children, scrollable = false, style }) {
  if (scrollable) {
    return (
      <ScrollView
        style={[styles.body, style]}
        contentContainerStyle={{ padding: spacing.lg }}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
    );
  }
  return <View style={[styles.body, { padding: spacing.lg }, style]}>{children}</View>;
};

AppModal.Footer = function AppModalFooter({ children, style }) {
  return <View style={[styles.footer, style]}>{children}</View>;
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.sm,
  },
  overlayMobile: {
    padding: 0,
    justifyContent: 'flex-end',
    alignItems: 'stretch',
  },
  flexCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },
  flexBottom: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'stretch',
    width: '100%',
  },
  content: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    width: '100%',
    maxHeight: '90%',
    // sombra iOS+Android+web
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 8,
  },
  headerImplicit: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  headerImplicitTitle: {
    flex: 1,
    fontSize: 17,
    fontFamily: fontFamily.semiBold || fontFamily.bold,
    fontWeight: '600',
    color: colors.text,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    fontSize: fonts.large,
    fontFamily: fontFamily.bold,
    fontWeight: '700',
    color: colors.text,
  },
  headerSubtitle: {
    marginTop: 4,
    fontSize: fonts.small,
    fontFamily: fontFamily.regular,
    color: colors.textSecondary,
  },
  body: {
    flexGrow: 0,
    flexShrink: 1,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    padding: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  closeBtn: {
    padding: 4,
    marginLeft: spacing.sm,
  },
});
