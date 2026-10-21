// Exportação do Dashboard (RF10). Bibliotecas carregadas sob demanda para não pesar o bundle inicial.
// data: { periodo, regiao, kpis:[[rótulo, valor]], porStatus:[{Status, Total}], porRegiao:[{...}], entregas:[{...}] }

const rows = (list) => list.map((o) => Object.values(o))
const head = (list) => [Object.keys(list[0] ?? { '': '' })]

export async function exportPDF(data, file = 'dashboard.pdf') {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const doc = new jsPDF()
  doc.setFontSize(16)
  doc.text('SENN AI-X — Dashboard', 14, 16)
  doc.setFontSize(10)
  doc.text(`Período: ${data.periodo}${data.regiao ? ` · Região: ${data.regiao}` : ''}`, 14, 23)
  autoTable(doc, { startY: 28, head: [['Indicador', 'Valor']], body: data.kpis })
  for (const [title, list] of [['Entregas por status', data.porStatus], ['Entregas por região', data.porRegiao]]) {
    if (!list.length) continue
    const y = doc.lastAutoTable.finalY + 10
    doc.text(title, 14, y)
    autoTable(doc, { startY: y + 3, head: head(list), body: rows(list) })
  }
  doc.save(file)
}

export async function exportExcel(data, file = 'dashboard.xlsx') {
  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()
  const add = (name, list) => XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(list), name)
  add('KPIs', [{ Indicador: 'Período', Valor: data.periodo }, ...data.kpis.map(([Indicador, Valor]) => ({ Indicador, Valor }))])
  add('PorStatus', data.porStatus)
  add('PorRegiao', data.porRegiao)
  add('Entregas', data.entregas)
  XLSX.writeFile(wb, file)
}
