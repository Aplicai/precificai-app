// utils/exportCsv.js — exportador CSV simples (Web only).
//
// Uso:
//   import { exportToCSV, isCsvExportSupported } from '../utils/exportCsv';
//   if (isCsvExportSupported()) exportToCSV('insumos.csv', rows, columns);
//
// `rows`    : array de objetos (qualquer chave)
// `columns` : array opcional [{ key, label }] definindo a ordem/cabeçalho.
//             Se omitido, usa as chaves do primeiro objeto como cabeçalho.
//
// Implementação:
//  - Inclui BOM (\uFEFF) para que o Excel/BR detecte UTF-8 e interprete acentos.
//  - Usa separador ; (padrão pt-BR; Excel BR não interpreta vírgula como separador).
//  - Escapa aspas duplicando-as e envolve qualquer célula contendo ; , " \n em "...".
//  - Aceita números com vírgula como decimal (substitui . por ,).
//
// Restrições:
//  - Apenas Web. Em mobile, retorna false em isCsvExportSupported() — caller deve
//    esconder a ação. Para mobile, seria necessário adicionar expo-sharing/file-system.

import { Platform } from 'react-native';

export function isCsvExportSupported() {
  if (Platform.OS !== 'web') return false;
  if (typeof window === 'undefined') return false;
  if (typeof Blob === 'undefined') return false;
  if (typeof URL === 'undefined' || !URL.createObjectURL) return false;
  return true;
}

function escapeCell(value) {
  if (value === null || value === undefined) return '';
  let str;
  if (typeof value === 'number') {
    // Decimal pt-BR: trocar . por ,
    str = String(value).replace('.', ',');
  } else if (typeof value === 'boolean') {
    str = value ? 'Sim' : 'Não';
  } else {
    str = String(value);
  }
  // Se contém separador, aspas, ou quebra de linha → quote
  if (/[;",\n\r]/.test(str)) {
    str = '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function buildCsv(rows, columns) {
  const cols = columns && columns.length > 0
    ? columns
    : (rows[0] ? Object.keys(rows[0]).map(k => ({ key: k, label: k })) : []);
  const header = cols.map(c => escapeCell(c.label)).join(';');
  const body = rows.map(r => cols.map(c => escapeCell(r[c.key])).join(';')).join('\r\n');
  return header + '\r\n' + body;
}

export function exportToCSV(filename, rows, columns) {
  if (!isCsvExportSupported()) return false;
  if (!rows || rows.length === 0) return false;
  const csv = '\uFEFF' + buildCsv(rows, columns);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'export.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Liberar o blob após pequeno delay para garantir o download
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}
