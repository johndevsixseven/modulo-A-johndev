import { useState } from 'react'

// Validação no blur: o erro de um campo aparece depois que ele perde o foco (ou ao enviar)
// e some assim que o valor fica válido, porque os erros são recalculados a cada mudança.
export function useForm(initial, validate) {
  const [values, setValues] = useState(initial)
  const [touched, setTouched] = useState({})
  const errors = validate(values)
  const shown = (k) => (touched[k] ? errors[k] : undefined)

  const field = (k) => {
    const err = shown(k)
    const props = {
      id: `f-${k}`,
      name: k,
      onChange: (e) => setValues((v) => ({ ...v, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })),
      onBlur: () => setTouched((t) => ({ ...t, [k]: true })),
      'aria-invalid': err ? true : undefined,
      'aria-describedby': err ? `f-${k}-erro` : undefined,
    }
    return typeof values[k] === 'boolean' ? { ...props, checked: values[k] } : { ...props, value: values[k] ?? '' }
  }

  return {
    values,
    setValues,
    errors,
    shown,
    field,
    valid: Object.keys(errors).length === 0,
    touchAll: () => setTouched(Object.fromEntries(Object.keys({ ...values, ...errors }).map((k) => [k, true]))),
    reset: (v) => { setValues(v); setTouched({}) },
  }
}
