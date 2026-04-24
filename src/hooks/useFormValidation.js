/**
 * Sprint 3 S6 — Hook `useFormValidation` com validação inline + auto-focus.
 *
 * MOTIVAÇÃO (audit MF1, FM1, FM3):
 *   - 15 telas de formulário fazem validação ad-hoc (if/else espalhado no onPress do botão).
 *   - Mensagens de erro aparecem em Alert.alert (péssima UX no web).
 *   - Sem auto-focus no primeiro campo inválido.
 *   - Sem asterisco automático em campos obrigatórios.
 *
 * API MÍNIMA:
 *   const { values, errors, setField, register, handleSubmit, focusFirstError, reset } =
 *     useFormValidation({
 *       schema: {
 *         nome:  { required: true, label: 'Nome' },
 *         preco: { required: true, type: 'number', min: 0, label: 'Preço' },
 *         email: { required: false, type: 'email', label: 'Email' },
 *       },
 *       initialValues: { nome: '', preco: '', email: '' },
 *     });
 *
 *   // No input:
 *   <TextInput {...register('nome')} />         // gera: value, onChangeText, ref, onBlur, accessibilityLabel
 *
 *   // No submit:
 *   <Button onPress={handleSubmit((values) => salvar(values))} />
 *
 *   // Feedback:
 *   {errors.nome && <Text style={{ color: colors.error }}>{errors.nome}</Text>}
 *
 * REGRAS DE SCHEMA SUPORTADAS:
 *   - required: boolean
 *   - type: 'number' | 'email' | 'string' (default)
 *   - min / max: para numbers
 *   - minLength / maxLength: para strings
 *   - pattern: RegExp custom
 *   - validate: (value, allValues) => string | undefined (custom validator; retorna mensagem de erro)
 *   - label: usado em mensagens ("Nome é obrigatório")
 *
 * AUTO-FOCUS:
 *   Quando handleSubmit falha validação, chama focusFirstError() que usa a ref
 *   registrada pelo register(name) para chamar .focus() no primeiro campo com erro.
 */

import { useCallback, useMemo, useRef, useState } from 'react';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function defaultMessage(rule, meta, label) {
  const name = label || meta.label || 'Campo';
  switch (rule) {
    case 'required': return `${name} é obrigatório`;
    case 'email':    return `${name} deve ser um email válido`;
    case 'number':   return `${name} deve ser numérico`;
    case 'min':      return `${name} deve ser ≥ ${meta.min}`;
    case 'max':      return `${name} deve ser ≤ ${meta.max}`;
    case 'minLength': return `${name} deve ter pelo menos ${meta.minLength} caracteres`;
    case 'maxLength': return `${name} deve ter no máximo ${meta.maxLength} caracteres`;
    case 'pattern':  return `${name} inválido`;
    default:         return `${name} inválido`;
  }
}

function validateField(value, rules, allValues) {
  if (!rules) return undefined;
  const isEmpty = value == null || value === '' || (typeof value === 'string' && value.trim() === '');

  if (rules.required && isEmpty) {
    return defaultMessage('required', rules);
  }

  // Se vazio e opcional, não valida mais nada.
  if (isEmpty) return undefined;

  if (rules.type === 'number') {
    const num = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
    if (!Number.isFinite(num)) return defaultMessage('number', rules);
    if (rules.min != null && num < rules.min) return defaultMessage('min', rules);
    if (rules.max != null && num > rules.max) return defaultMessage('max', rules);
  }

  if (rules.type === 'email') {
    if (!EMAIL_RE.test(String(value))) return defaultMessage('email', rules);
  }

  if (typeof value === 'string') {
    if (rules.minLength != null && value.length < rules.minLength) return defaultMessage('minLength', rules);
    if (rules.maxLength != null && value.length > rules.maxLength) return defaultMessage('maxLength', rules);
  }

  if (rules.pattern instanceof RegExp && !rules.pattern.test(String(value))) {
    return defaultMessage('pattern', rules);
  }

  if (typeof rules.validate === 'function') {
    const custom = rules.validate(value, allValues);
    if (custom) return custom;
  }

  return undefined;
}

export default function useFormValidation({ schema = {}, initialValues = {} } = {}) {
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const refs = useRef({});

  const fieldOrder = useMemo(() => Object.keys(schema), [schema]);

  const setField = useCallback((name, value) => {
    setValues(prev => ({ ...prev, [name]: value }));
    // Limpa erro daquele campo assim que o usuário digita (feedback mais suave).
    setErrors(prev => (prev[name] ? { ...prev, [name]: undefined } : prev));
  }, []);

  const setFieldTouched = useCallback((name) => {
    setTouched(prev => (prev[name] ? prev : { ...prev, [name]: true }));
  }, []);

  const validateAll = useCallback((valuesToCheck) => {
    const v = valuesToCheck || values;
    const out = {};
    for (const name of fieldOrder) {
      const err = validateField(v[name], schema[name], v);
      if (err) out[name] = err;
    }
    return out;
  }, [fieldOrder, schema, values]);

  const focusFirstError = useCallback((errObj) => {
    const errs = errObj || errors;
    for (const name of fieldOrder) {
      if (errs[name] && refs.current[name] && typeof refs.current[name].focus === 'function') {
        try { refs.current[name].focus(); } catch (_) {}
        return name;
      }
    }
    return null;
  }, [errors, fieldOrder]);

  const handleSubmit = useCallback((onValid, onInvalid) => {
    return (...args) => {
      const errs = validateAll(values);
      setErrors(errs);
      // marca todos como touched para exibir todos erros
      const allTouched = {};
      fieldOrder.forEach(n => { allTouched[n] = true; });
      setTouched(allTouched);

      if (Object.keys(errs).length > 0) {
        focusFirstError(errs);
        if (typeof onInvalid === 'function') onInvalid(errs, values);
        return;
      }
      if (typeof onValid === 'function') onValid(values, ...args);
    };
  }, [fieldOrder, focusFirstError, validateAll, values]);

  const register = useCallback((name) => {
    const rules = schema[name] || {};
    return {
      value: values[name] != null ? String(values[name] ?? '') : '',
      onChangeText: (text) => setField(name, text),
      onBlur: () => {
        setFieldTouched(name);
        // Validação onBlur para feedback inline sem esperar submit.
        const err = validateField(values[name], rules, values);
        setErrors(prev => ({ ...prev, [name]: err }));
      },
      ref: (node) => { refs.current[name] = node; },
      accessibilityLabel: rules.label ? (rules.required ? `${rules.label} (obrigatório)` : rules.label) : undefined,
      // Componentes custom (TextInput customizado) podem ler esses flags:
      required: !!rules.required,
      error: touched[name] ? errors[name] : undefined,
    };
  }, [errors, schema, setField, setFieldTouched, touched, values]);

  const reset = useCallback((next) => {
    setValues(next || initialValues);
    setErrors({});
    setTouched({});
  }, [initialValues]);

  return {
    values,
    errors,
    touched,
    setField,
    setValues,
    register,
    handleSubmit,
    focusFirstError,
    reset,
    // Helper quando se quer validar manualmente:
    validateAll,
  };
}
