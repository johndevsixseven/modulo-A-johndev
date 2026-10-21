// Label visível + controle + mensagem de erro anunciada (o controle recebe id/aria-* de useForm().field).
export default function Field({ name, label, hint, error, children }) {
  return (
    <div className="field">
      <label htmlFor={`f-${name}`}>
        {label}{hint && <span className="hint"> {hint}</span>}
      </label>
      {children}
      <p id={`f-${name}-erro`} className="field-error" aria-live="polite">{error}</p>
    </div>
  )
}
