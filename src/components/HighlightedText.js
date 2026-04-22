import React from 'react';
import { Text } from 'react-native';
import { colors } from '../utils/theme';

/**
 * HighlightedText — destaca trechos do texto que correspondem à query de busca.
 *
 * Útil em listas com SearchBar para indicar visualmente onde o termo digitado
 * aparece em cada item. Case-insensitive e tolerante a acentos.
 *
 * Props:
 *  - text: string — conteúdo completo
 *  - query: string — termo a destacar (vazio = sem highlight)
 *  - style?: TextStyle — estilo base do <Text> wrapper
 *  - highlightStyle?: TextStyle — sobrescreve o estilo padrão do destaque
 *  - numberOfLines?: number
 */
function normalize(s) {
  if (!s) return '';
  return s
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export default function HighlightedText({
  text = '',
  query = '',
  style,
  highlightStyle,
  numberOfLines,
}) {
  const safeText = text == null ? '' : String(text);
  const safeQuery = query == null ? '' : String(query).trim();

  if (!safeQuery) {
    return (
      <Text style={style} numberOfLines={numberOfLines}>
        {safeText}
      </Text>
    );
  }

  // Normaliza ambos para encontrar matches sem acento, mas renderiza o original
  const normText = normalize(safeText);
  const normQuery = normalize(safeQuery);

  if (!normQuery || !normText.includes(normQuery)) {
    return (
      <Text style={style} numberOfLines={numberOfLines}>
        {safeText}
      </Text>
    );
  }

  // Encontra todos os índices das matches no texto normalizado
  const ranges = [];
  const regex = new RegExp(escapeRegExp(normQuery), 'g');
  let m;
  while ((m = regex.exec(normText)) !== null) {
    ranges.push([m.index, m.index + normQuery.length]);
    if (m.index === regex.lastIndex) regex.lastIndex++;
  }

  if (ranges.length === 0) {
    return (
      <Text style={style} numberOfLines={numberOfLines}>
        {safeText}
      </Text>
    );
  }

  // Constrói segmentos alternando texto normal e destaque
  const segments = [];
  let cursor = 0;
  ranges.forEach(([start, end], idx) => {
    if (start > cursor) {
      segments.push({ text: safeText.slice(cursor, start), highlighted: false });
    }
    segments.push({ text: safeText.slice(start, end), highlighted: true });
    cursor = end;
  });
  if (cursor < safeText.length) {
    segments.push({ text: safeText.slice(cursor), highlighted: false });
  }

  const defaultHighlight = {
    backgroundColor: (colors.accent || '#FFD37A') + '55',
    color: colors.text || '#102030',
    fontWeight: '700',
  };

  return (
    <Text style={style} numberOfLines={numberOfLines}>
      {segments.map((seg, i) =>
        seg.highlighted ? (
          <Text key={i} style={highlightStyle || defaultHighlight}>
            {seg.text}
          </Text>
        ) : (
          seg.text
        )
      )}
    </Text>
  );
}
