/**
 * "Selecionar tudo ao focar" sem engolir a primeira tecla (web).
 *
 * Bug (2026-10): no react-native-web, `selectTextOnFocus` agenda o
 * `input.select()` num setTimeout. Quando a thread está ocupada (popup abrindo,
 * lista grande re-renderizando), o navegador processa a primeira tecla ANTES
 * desse timer — eventos de teclado têm prioridade sobre timers. O select()
 * chega depois, seleciona o que a pessoa acabou de digitar e a segunda tecla
 * substitui tudo: "140,00" vira "40,00", "12" vira "2".
 *
 * Aqui o texto é selecionado na hora do foco (o Chrome mantém a seleção até o
 * mouseup) e de novo no timer, para o Safari, que desfaz a seleção no mouseup.
 * O timer só seleciona se o valor ainda é o do momento do foco: se a pessoa já
 * digitou, não mexe.
 *
 * Uso (só web; no nativo continue com `selectTextOnFocus`):
 *   <TextInput {...selecionarTudoAoFocarProps(Platform.OS)} />
 */

export function criarSelecionarAoFocar({
  agendar = (fn) => setTimeout(fn, 0),
  elementoAtivo = () => (typeof document !== 'undefined' ? document.activeElement : null),
} = {}) {
  return function selecionarAoFocar(e) {
    const node = e && (e.target || (e.nativeEvent && e.nativeEvent.target));
    if (!node || typeof node.select !== 'function') return;
    const valorNoFoco = node.value;
    const selecionar = () => {
      if (elementoAtivo() !== node) return;
      if (node.value !== valorNoFoco) return; // já digitou: selecionar engoliria a próxima tecla
      node.select();
    };
    selecionar();
    agendar(selecionar);
  };
}

export const selecionarTudoAoFocar = criarSelecionarAoFocar();

/**
 * Props para o TextInput: no web usa o handler acima; no nativo mantém o
 * `selectTextOnFocus` (lá não há a corrida do timer).
 */
export function selecionarTudoAoFocarProps(platformOS) {
  if (platformOS === 'web') return { onFocus: selecionarTudoAoFocar };
  return { selectTextOnFocus: true };
}
