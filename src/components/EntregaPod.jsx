import { useRef, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { dbMessage } from '../lib/dbError.js'

// Assinatura em canvas próprio (pointer events: dedo, caneta ou mouse).
function SignaturePad({ canvasRef, onDraw, onClear }) {
  const drawing = useRef(false)
  const pos = (e) => {
    const r = e.currentTarget.getBoundingClientRect()
    return [(e.clientX - r.left) * (e.currentTarget.width / r.width), (e.clientY - r.top) * (e.currentTarget.height / r.height)]
  }
  const down = (e) => {
    drawing.current = true
    e.currentTarget.setPointerCapture(e.pointerId)
    const ctx = e.currentTarget.getContext('2d')
    ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.strokeStyle = '#000'
    ctx.beginPath(); ctx.moveTo(...pos(e))
  }
  const move = (e) => {
    if (!drawing.current) return
    const ctx = e.currentTarget.getContext('2d')
    ctx.lineTo(...pos(e)); ctx.stroke(); onDraw()
  }
  const clear = () => { canvasRef.current.getContext('2d').clearRect(0, 0, 600, 200); onClear() }
  return (
    <div className="stack">
      <canvas ref={canvasRef} width={600} height={200} className="signature" aria-label="Área de assinatura do destinatário"
        onPointerDown={down} onPointerMove={move} onPointerUp={() => { drawing.current = false }} />
      <div><button type="button" className="secondary" onClick={clear}>Limpar assinatura</button></div>
    </div>
  )
}

// Geolocalização com fallback para a coordenada da parada (avisando).
const locate = (stop) => new Promise((resolve) => {
  const fallback = () => resolve({ lat: stop.lat, lng: stop.lng, approx: true })
  if (!navigator.geolocation) return fallback()
  navigator.geolocation.getCurrentPosition(
    (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, approx: false }), fallback,
    { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 })
})

// RF07 · Comprovante de entrega de uma parada. Data/hora: o servidor força (trigger pods_before_insert).
export default function EntregaPod({ stop, driverId, onDone }) {
  const [open, setOpen] = useState(false)
  const [result, setResult] = useState('entregue')
  const [reason, setReason] = useState('')
  const [method, setMethod] = useState('codigo')
  const [code, setCode] = useState('')
  const [file, setFile] = useState(null)
  const [signed, setSigned] = useState(false)
  const [msg, setMsg] = useState({ text: '', error: false })
  const [busy, setBusy] = useState(false)
  const canvas = useRef(null)
  const id = `pod-${stop.id}`

  if (['entregue', 'falha', 'cancelada'].includes(stop.status)) return null
  if (!open) return <div><button type="button" onClick={() => setOpen(true)}>Registrar entrega<span className="sr-only"> {stop.code}</span></button></div>

  async function upload(blob, ext) {
    const path = `${stop.id}/${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('pod').upload(path, blob, { contentType: blob.type })
    if (error) throw error
    return path
  }

  async function submit(e) {
    e.preventDefault()
    if (result === 'falha' && !reason.trim()) return setMsg({ text: 'Informe o motivo da falha.', error: true })
    if (result === 'entregue') {
      if (method === 'codigo' && !code.trim()) return setMsg({ text: 'Digite o código de confirmação.', error: true })
      if (method === 'foto' && !file) return setMsg({ text: 'Escolha ou tire uma foto.', error: true })
      if (method === 'assinatura' && !signed) return setMsg({ text: 'Peça a assinatura do destinatário.', error: true })
    }
    setBusy(true)
    setMsg({ text: 'Obtendo localização…', error: false })
    try {
      const geo = await locate(stop)
      const row = { delivery_id: stop.id, driver_id: driverId, result, lat: geo.lat, lng: geo.lng,
        failure_reason: result === 'falha' ? reason.trim() : null }
      if (result === 'entregue') {
        row.method = method
        if (method === 'codigo') row.code = code.trim()
        if (method === 'foto') row.photo_path = await upload(file, file.name.split('.').pop().toLowerCase() || 'jpg')
        if (method === 'assinatura') {
          const blob = await new Promise((r) => canvas.current.toBlob(r, 'image/png'))
          row.signature_path = await upload(blob, 'png')
        }
      }
      const { error } = await supabase.from('pods').insert(row)
      if (error) throw error
      setMsg({ text: `Registrado.${geo.approx ? ' Localização do aparelho indisponível: usada a coordenada da parada.' : ''}`, error: false })
      onDone()
    } catch (err) {
      setMsg({ text: dbMessage(err), error: true })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="card stack" onSubmit={submit} aria-labelledby={`${id}-h`}>
      <h3 id={`${id}-h`}>Comprovante · {stop.code}</h3>
      <fieldset>
        <legend>Resultado</legend>
        <label><input type="radio" name={`${id}-res`} checked={result === 'entregue'} onChange={() => setResult('entregue')} /> Entregue</label>{' '}
        <label><input type="radio" name={`${id}-res`} checked={result === 'falha'} onChange={() => setResult('falha')} /> Falha</label>
      </fieldset>
      {result === 'falha' ? (
        <div className="field">
          <label htmlFor={`${id}-mot`}>Motivo da falha</label>
          <input id={`${id}-mot`} value={reason} onChange={(e) => setReason(e.target.value)} required />
        </div>
      ) : (
        <>
          <div className="field">
            <label htmlFor={`${id}-met`}>Evidência</label>
            <select id={`${id}-met`} value={method} onChange={(e) => { setMethod(e.target.value); setSigned(false) }}>
              <option value="codigo">Código de confirmação</option>
              <option value="foto">Foto</option>
              <option value="assinatura">Assinatura</option>
            </select>
          </div>
          {method === 'codigo' && (
            <div className="field">
              <label htmlFor={`${id}-cod`}>Código informado pelo destinatário</label>
              <input id={`${id}-cod`} value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" />
            </div>
          )}
          {method === 'foto' && (
            <div className="field">
              <label htmlFor={`${id}-foto`}>Foto (JPG, PNG ou WebP, até 5 MB)</label>
              <input id={`${id}-foto`} type="file" accept="image/jpeg,image/png,image/webp" capture="environment"
                onChange={(e) => setFile(e.target.files[0] ?? null)} />
            </div>
          )}
          {method === 'assinatura' && <SignaturePad canvasRef={canvas} onDraw={() => setSigned(true)} onClear={() => setSigned(false)} />}
        </>
      )}
      <p className="hint">Data e hora são registradas pelo servidor; a localização vem do aparelho.</p>
      <p className={msg.error ? 'error' : 'success'} role="status" aria-live="polite">{msg.text}</p>
      <div className="row-actions">
        <button type="submit" disabled={busy}>{busy ? 'Salvando…' : 'Salvar comprovante'}</button>
        <button type="button" className="secondary" onClick={() => setOpen(false)} disabled={busy}>Cancelar</button>
      </div>
    </form>
  )
}
