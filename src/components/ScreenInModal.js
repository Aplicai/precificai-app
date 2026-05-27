/**
 * ScreenInModal — Sessão 28.71
 *
 * Renderiza uma TELA (screen component do React Navigation) DENTRO de um Modal
 * empilhado, sem navegar pra fora do contexto atual. Usado pela cascata de
 * criação de entidades (EntityCreateModal → Insumo/Embalagem como modal
 * empilhado, igual o nested Preparo já fazia).
 *
 * Reaproveita os formulários COMPLETOS (MateriaPrimaFormScreen,
 * EmbalagemFormScreen) sem reescrevê-los: passamos um `navigation` shim e um
 * `route` shim. O form decide o comportamento de retorno via
 * `route.params.asModal` / `onSavedModal` / `onCloseModal`.
 *
 * Props:
 *   visible: bool
 *   screen:  componente de tela (ex.: MateriaPrimaFormScreen)
 *   params:  objeto de params injetado em route.params
 *   onClose: () => void   (chamado pelo navShim.goBack / requestClose)
 *
 * Os formulários internos usam ModalFormWrapper, que já renderiza seu próprio
 * card/header (desktop) ou header full-screen (mobile). Por isso o overlay
 * aqui é só um container que dá o espaço; o backdrop visual vem do wrapper.
 */
import React, { useMemo } from 'react';
import { View, Modal, Platform, StyleSheet } from 'react-native';
import useResponsiveLayout from '../hooks/useResponsiveLayout';

export default function ScreenInModal({ visible, screen: Screen, params = {}, onClose }) {
  const { isDesktop } = useResponsiveLayout();

  // navShim — imita a superfície mínima do objeto `navigation` do React
  // Navigation que os formulários consomem. goBack/navigate fecham o modal
  // em vez de navegar de verdade (o EntityCreateModal pai continua montado).
  const navShim = useMemo(() => ({
    goBack: () => { onClose && onClose(); },
    navigate: () => { onClose && onClose(); },
    replace: () => { onClose && onClose(); },
    canGoBack: () => true,
    getParent: () => null,
    setOptions: () => {},
    setParams: () => {},
    // CRÍTICO: o React Navigation faz addListener() retornar uma FUNÇÃO de
    // unsubscribe. Várias telas fazem `const unsub = navigation.addListener(...);
    // return unsub;` num useEffect — React chama esse retorno como função no
    // unmount. Se retornássemos um objeto `{remove(){}}`, daria "is not a
    // function" e crasharia (tela branca) ao fechar o modal. Então devolvemos
    // uma função que TAMBÉM tem `.remove` (cobre os dois padrões de uso).
    addListener: () => {
      const unsub = () => {};
      unsub.remove = () => {};
      return unsub;
    },
    removeListener: () => {},
    isFocused: () => true,
    dispatch: () => {},
    push: () => {},
    reset: () => {},
  }), [onClose]);

  const route = useMemo(() => ({
    key: 'modal-' + (params?.__name || 'ModalScreen'),
    name: params?.__name || 'ModalScreen',
    params,
  }), [params]);

  if (!Screen) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={[styles.overlay, !isDesktop && styles.overlayMobile]}>
        <View style={isDesktop ? styles.contentDesktop : styles.contentMobile}>
          {visible ? <Screen route={route} navigation={navShim} /> : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // Desktop: container centralizado; o ModalFormWrapper interno desenha o
  // backdrop escuro + card, então aqui mantemos transparente e deixamos o
  // wrapper preencher (flex:1). zIndex defensivo alto pra ficar SEMPRE por
  // cima do EntityCreateModal pai (que usa zIndex 1000).
  overlay: {
    flex: 1,
    ...Platform.select({ web: { zIndex: 2000 }, default: {} }),
  },
  overlayMobile: {
    flex: 1,
  },
  // O ModalFormWrapper desktop já centraliza/limita o card (maxWidth 640,
  // maxHeight 90%). Deixamos o container ocupar tudo pra ele se posicionar.
  contentDesktop: {
    flex: 1,
  },
  contentMobile: {
    flex: 1,
  },
});
