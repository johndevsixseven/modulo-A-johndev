import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { parseOrdersCsv } from '../lib/csv.js'
import { geocode, geocodeEnabled } from '../lib/geocode.js'
import { dbMessage } from '../lib/dbError.js'

// Importação CSV (PLANO.md seção 7): prévia com motivo por linha → grava só as válidas num único insert
// → geocodifica as sem lat/lng em fila de 1 req/s (para no primeiro erro do serviço).
export default function ImportarPedidos({ onImported }) {
  const [preview, setPreview] = useState(null) // { name, missing, items }
  const [msg, setMsg] = useState({ text: '', error: false })
  const [busy, setBusy] = useState(false)
  const alive = useRef(true)
  const fileRef = useRef(null)

  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])

  async function handleFile(e) {
    const file = e.target.files?.[0]
    setPreview(null)
    setMsg({ text: '', error: false })
    if (!file) return
    setBusy(true)
    try {
      const text = await file.text()
      const first = parseOrdersCsv(text)
      const codes = [...new Set(first.items.map((i) => i.code).filter(Boolean))]
      const existing = new Set()
      for (let i = 0; i < codes.length; i += 200) { // lotes para não estourar o tamanho da URL
        const { data, error } = await supabase.from('deliveries').select('code').in('code', codes.slice(i, i + 200))
        if (error) throw error
        data.forEach((d) => existing.add(d.code))
      }
      setPreview({ name: file.name, ...parseOrdersCsv(text, existing) })
    } catch (err) {
      setMsg({ text: err.code ? dbMessage(err) : 'Não conseguimos ler este arquivo. Confira se é um CSV em UTF-8 e tente de novo.', error: true })
    } finally {
      setBusy(false)
    }
  }

  async function importValid() {
    const valid = preview.items.filter((i) => i.reasons.length === 0).map((i) => i.row)
    setBusy(true)
    const { data, error } = await supabase.from('deliveries').insert(valid).select('id, code, address, lat')
    if (error) {
      setBusy(false)
      setMsg({ text: dbMessage(error, 'Algum código já foi cadastrado enquanto você revisava. Selecione o arquivo de novo para atualizar a prévia.'), error: true })
      return
    }
    setPreview(null)
    if (fileRef.current) fileRef.current.value = ''
    onImported()

    const pending = data.filter((d) => d.lat == null)
    let located = 0, failed = false
    if (geocodeEnabled) {
      for (const [n, d] of pending.entries()) {
        if (!alive.current) return
        setMsg({ text: `${data.length} pedido(s) importado(s). Localizando endereços: ${n + 1} de ${pending.length}…`, error: false })
        try {
          const hit = await geocode(d.address)
          if (hit && (await supabase.from('deliveries').update(hit).eq('id', d.id)).error == null) located++
        } catch {
          failed = true
          break // serviço fora do ar: não insiste nas próximas linhas
        }
      }
    }
    if (!alive.current) return
    setBusy(false)
    const missing = pending.length - located
    setMsg({
      text: `${data.length} pedido(s) importado(s).` + (missing
        ? ` ${missing} ficaram sem coordenada${failed ? ' porque o serviço de localização não respondeu' : ''}: edite cada um para localizar de novo ou digitar latitude e longitude.`
        : ''),
      error: false,
    })
    onImported()
  }

  const validCount = preview?.items.filter((i) => i.reasons.length === 0).length ?? 0
  const invalidCount = (preview?.items.length ?? 0) - validCount

  return (
    <section className="card stack" aria-labelledby="importar-titulo">
      <h2 id="importar-titulo">Importar pedidos (CSV)</h2>
      <p>
        Colunas: codigo, destinatario, telefone, endereco, regiao, lat, lng, janela_inicio, janela_fim, peso_kg,
        volume_m3, prioridade, consentimento, finalidade. Separador <code>;</code> ou <code>,</code>; datas
        AAAA-MM-DD HH:mm (horário de Brasília). Sem lat/lng, o endereço é localizado depois da importação.{' '}
        <a href="/exemplo-pedidos.csv" download>Baixar arquivo de exemplo</a>
      </p>
      <div className="field">
        <label htmlFor="csv-arquivo">Arquivo CSV</label>
        <input id="csv-arquivo" ref={fileRef} type="file" accept=".csv,text/csv" onChange={handleFile} disabled={busy} />
      </div>
      <p className={msg.error ? 'error' : 'success'} role="status" aria-live="polite">{msg.text}</p>

      {preview && (preview.missing.length > 0 ? (
        <p className="error" role="alert">
          O arquivo {preview.name} não tem as colunas obrigatórias: {preview.missing.join(', ')}. Use o arquivo de exemplo como modelo.
        </p>
      ) : (
        <div className="stack">
          <p role="status" aria-live="polite">
            Prévia de {preview.name}: <strong>{validCount} válida(s)</strong>, <strong>{invalidCount} com erro</strong>.
            {invalidCount > 0 && ' As linhas com erro não serão gravadas; corrija no arquivo e selecione-o de novo.'}
          </p>
          {preview.items.length === 0 ? <p>O arquivo não tem linhas de pedidos.</p> : (
            <div className="table-wrap">
              <table>
                <caption className="sr-only">Prévia da importação</caption>
                <thead>
                  <tr><th scope="col">Linha</th><th scope="col">Código</th><th scope="col">Destinatário</th>
                    <th scope="col">Situação</th><th scope="col">Motivo</th></tr>
                </thead>
                <tbody>
                  {preview.items.map((i) => (
                    <tr key={i.line}>
                      <td>{i.line}</td>
                      <td>{i.code || '—'}</td>
                      <td>{i.row.recipient_name || '—'}</td>
                      <td>{i.reasons.length
                        ? <span className="badge danger">Com erro</span>
                        : <span className="badge ok">Válida</span>}</td>
                      <td>{i.reasons.length ? i.reasons.join(' ') : (i.row.lat == null ? 'Sem coordenada: será localizada pelo endereço.' : '—')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="row-actions">
            <button type="button" onClick={importValid} disabled={busy || validCount === 0}>
              Importar {validCount} pedido(s) válido(s)
            </button>
            <button type="button" className="secondary" disabled={busy}
              onClick={() => { setPreview(null); if (fileRef.current) fileRef.current.value = '' }}>
              Descartar prévia
            </button>
          </div>
        </div>
      ))}
    </section>
  )
}
