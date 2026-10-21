import { useId, useState } from 'react'

const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')

/**
 * Tabela com busca e ordenação no cliente.
 * columns: [{ key, label, render?(row), value?(row) }] — value é usado na busca/ordenação (padrão row[key]).
 * empty: conteúdo quando não há nenhuma linha (estado vazio com ação).
 */
export default function DataTable({ columns, rows, getKey = (r) => r.id, searchLabel = 'Buscar', empty, caption }) {
  const id = useId()
  const [q, setQ] = useState('')
  const [sort, setSort] = useState({ key: null, dir: 1 })
  const val = (c, r) => (c.value ? c.value(r) : r[c.key])

  if (rows.length === 0) return empty

  const term = norm(q.trim())
  let shown = term ? rows.filter((r) => columns.some((c) => norm(val(c, r)).includes(term))) : rows
  const sc = columns.find((c) => c.key === sort.key)
  if (sc) {
    shown = [...shown].sort((a, b) => {
      const x = val(sc, a), y = val(sc, b)
      if (x == null || x === '') return 1
      if (y == null || y === '') return -1
      return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'pt-BR')) * sort.dir
    })
  }

  return (
    <div className="stack">
      <div className="field search">
        <label htmlFor={id}>{searchLabel}</label>
        <input id={id} type="search" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <p className="hint" role="status" aria-live="polite">{shown.length} de {rows.length} registro(s)</p>
      {shown.length === 0 ? (
        <div className="empty">
          <p>Nada encontrado para “{q}”.</p>
          <button type="button" className="secondary" onClick={() => setQ('')}>Limpar busca</button>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <caption className="sr-only">{caption}</caption>
            <thead>
              <tr>
                {columns.map((c) => (
                  c.sortable === false ? <th key={c.key} scope="col">{c.label}</th> : (
                    <th key={c.key} scope="col"
                      aria-sort={sort.key === c.key ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined}>
                      <button type="button" className="th-sort"
                        onClick={() => setSort((s) => ({ key: c.key, dir: s.key === c.key ? -s.dir : 1 }))}>
                        {c.label}<span aria-hidden="true">{sort.key === c.key ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}</span>
                      </button>
                    </th>
                  )
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={getKey(r)}>
                  {columns.map((c) => <td key={c.key}>{c.render ? c.render(r) : (val(c, r) ?? '—')}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
