// Classificação da Matriz BCG (ranking de produtos) — extraída de
// MatrizBCGScreen para permitir teste unitário (`node --test`) e desacoplar a
// regra de negócio da UI.
//
// CONTRATO: cada item deve trazer { precoVenda, margemPerc, qtdVendida }, onde
// `qtdVendida` é a quantidade do MÊS DE REFERÊNCIA — o mês anterior já fechado,
// que o usuário digita e vê na tela. A classificação cruza dois eixos (margem x
// vendas) usando a mediana de cada um.
//
// HISTÓRICO DO BUG (corrigido nesta sessão): após o redesign 28.49, que deslocou
// `currentMonth` para o mês anterior, a classificação continuou lendo
// `qtdVendidaRanking` (= dois meses atrás). Resultado: o ranking ignorava as
// vendas que o usuário acabara de cadastrar (apareciam 0 un). O fix é classificar
// pelo MESMO mês que é digitado/exibido: `qtdVendida`.

const sortAsc = (arr) => [...arr].sort((a, b) => a - b);

// Mediana simples. Array vazio → 0 (chamadores garantem base não-vazia quando
// relevante).
export function median(arr) {
  if (!arr || arr.length === 0) return 0;
  const s = sortAsc(arr);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// Recebe a lista de produtos/combos já com custo, margem e quantidade vendida no
// mês de referência. Devolve a MESMA lista com `classificacao` preenchida.
export function classificarMatrizBCG(items) {
  const list = items || [];
  const validItems = list.filter((p) => p.precoVenda > 0);

  // Menos de 2 produtos válidos: não há base para mediana/quadrantes.
  if (validItems.length < 2) {
    return list.map((p) => ({ ...p, classificacao: 'Quebra-Cabeça' }));
  }

  // Sessão 28.25: produto SEM venda não pode virar Estrela/Cavalo. Só entram na
  // mediana de vendas os itens COM venda > 0.
  const itensComVenda = validItems.filter((p) => p.qtdVendida > 0);
  const medianaVendas = itensComVenda.length > 0
    ? median(itensComVenda.map((p) => p.qtdVendida))
    : 0;
  const medianaMargem = median(validItems.map((p) => p.margemPerc));

  return list.map((p) => {
    const altaMargem = p.margemPerc >= medianaMargem;
    // Sessão 28.73 (B2): eixo de VENDAS usa `>` ESTRITO — item exatamente na
    // mediana conta como baixa venda, evitando clusters na mediana inflarem
    // "alta venda". Margem mantém `>=` (empate conta como alta).
    const altaVenda = p.qtdVendida > 0 && p.qtdVendida > medianaVendas;
    let classificacao;
    if (altaMargem && altaVenda) classificacao = 'Estrela';
    else if (!altaMargem && altaVenda) classificacao = 'Cavalo de Batalha';
    else if (altaMargem && !altaVenda) classificacao = 'Quebra-Cabeça';
    else classificacao = 'Abacaxi';
    return { ...p, classificacao };
  });
}
