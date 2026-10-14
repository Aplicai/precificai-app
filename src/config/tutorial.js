/**
 * Vídeo tutorial 01 — "Primeiros passos" (YouTube, 4:48, público).
 *
 * Do primeiro acesso ao primeiro produto precificado. Os tempos abaixo são os
 * capítulos publicados no YouTube; se o vídeo for trocado, atualize aqui.
 */
export const TUTORIAL_VIDEO_ID = 'qG2BFhvEFkU';

export const TUTORIAL_TITULO = 'Primeiros passos no Precificaí';
export const TUTORIAL_DURACAO = '5 min';

// Início de cada capítulo, em segundos.
export const CAPITULOS = {
  abertura:     { t: 0,   titulo: 'O que você vai aprender' },
  primeiroAcesso: { t: 17,  titulo: 'Primeiro acesso e Kit de Início' },
  tela:         { t: 53,  titulo: 'Conhecendo a tela' },
  financeiro:   { t: 93,  titulo: 'Financeiro: as contas do mês' },
  ingrediente:  { t: 173, titulo: 'Cadastrando o primeiro ingrediente' },
  produto:      { t: 211, titulo: 'Montando o produto e vendo o preço sugerido' },
  proximos:     { t: 265, titulo: 'Próximos passos' },
};

export const ORDEM_CAPITULOS = ['abertura', 'primeiroAcesso', 'tela', 'financeiro', 'ingrediente', 'produto', 'proximos'];

function inicioDe(capitulo) {
  if (typeof capitulo === 'number' && Number.isFinite(capitulo) && capitulo >= 0) return Math.floor(capitulo);
  return CAPITULOS[capitulo]?.t ?? 0;
}

/** "1:33" a partir de segundos. */
export function formatarTempo(seg) {
  const s = Math.max(0, Math.floor(Number(seg) || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Player embutido. youtube-nocookie não grava cookie de rastreio antes do play.
 * @param {string|number} capitulo — chave de CAPITULOS ou segundos
 */
export function urlEmbed(capitulo) {
  const t = inicioDe(capitulo);
  const qs = ['autoplay=1', 'rel=0', 'modestbranding=1', 'playsinline=1'];
  if (t > 0) qs.push(`start=${t}`);
  return `https://www.youtube-nocookie.com/embed/${TUTORIAL_VIDEO_ID}?${qs.join('&')}`;
}

/** Link para abrir no YouTube (app nativo ou fallback). */
export function urlYoutube(capitulo) {
  const t = inicioDe(capitulo);
  return `https://youtu.be/${TUTORIAL_VIDEO_ID}${t > 0 ? `?t=${t}` : ''}`;
}
