import { useEffect, useRef } from 'react'

// Confirmação de ação destrutiva com o nome do item. <dialog> nativo: prende o foco, Esc cancela e devolve o foco.
export default function ConfirmDialog({ open, title, children, confirmLabel, busy, onConfirm, onCancel }) {
  const ref = useRef(null)

  useEffect(() => {
    const d = ref.current
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])

  return (
    <dialog ref={ref} className="card" aria-labelledby="confirm-titulo" onClose={onCancel}>
      <div className="stack">
        <h2 id="confirm-titulo">{title}</h2>
        <p>{children}</p>
        <div className="row-actions">
          <button type="button" className="secondary" onClick={onCancel} autoFocus>Cancelar</button>
          <button type="button" className="danger" onClick={onConfirm} disabled={busy}>{confirmLabel}</button>
        </div>
      </div>
    </dialog>
  )
}
