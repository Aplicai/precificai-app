import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { calcKeyboardInset } from '../utils/keyboardInset';

/**
 * useKeyboardInset — quantos pixels o teclado virtual está cobrindo embaixo.
 *
 * Devolve 0 quando não há teclado, fora do web, ou quando o navegador não expõe
 * `window.visualViewport`. Ou seja: em todo caminho duvidoso o retorno é 0 e a
 * tela fica igual ao que era antes.
 *
 * Existe porque `KeyboardAvoidingView` não funciona no react-native-web (ver o
 * cabeçalho de `src/utils/keyboardInset.js`). Use o valor pra levantar bottom
 * sheets e modais `position: fixed`, que senão são desenhados atrás do teclado.
 */
export default function useKeyboardInset() {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    if (Platform.OS !== 'web') return undefined;
    if (typeof window === 'undefined') return undefined;

    const vv = window.visualViewport;
    if (!vv) return undefined; // Safari < 13, navegadores antigos: sem medida, sem ajuste.

    let frame = null;

    const measure = () => {
      frame = null;
      setInset(calcKeyboardInset({
        innerHeight: window.innerHeight,
        viewportHeight: vv.height,
        viewportOffsetTop: vv.offsetTop,
      }));
    };

    // O visual viewport dispara muitos eventos durante a animação do teclado.
    // Um rAF por quadro evita re-render a cada pixel.
    const schedule = () => {
      if (frame != null) return;
      frame = window.requestAnimationFrame(measure);
    };

    measure();
    vv.addEventListener('resize', schedule);
    vv.addEventListener('scroll', schedule);

    return () => {
      if (frame != null) window.cancelAnimationFrame(frame);
      vv.removeEventListener('resize', schedule);
      vv.removeEventListener('scroll', schedule);
    };
  }, []);

  return inset;
}
