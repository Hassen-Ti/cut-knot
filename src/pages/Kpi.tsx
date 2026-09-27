import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Footer, Shell3, WhatIveDone } from '../components/Shell'

const kpis = [
  { id: 'avg', name: 'Coût moyen au km', val: '2.41 €' },
  { id: 'gap', name: 'Écart zone critique', val: '+0.38 €' },
  { id: 'pct', name: '% tournées hors seuil', val: '12%' },
  { id: 'vol', name: 'Volume km parcouru', val: '1 240' },
]

export default function Kpi() {
  const [sel, setSel] = useState('gap')
  const selected = kpis.find((k) => k.id === sel)!
  return (
    <Shell3
      center={
        <section className="panel">
          <div className="panel-title">KPI <span>· Coût du dernier kilomètre — focus zones</span></div>
          <div className="kpi-grid">
            {kpis.map((k) => (
              <div key={k.id} className={`kpi-card${k.id === sel ? ' selected' : ''}`} onClick={() => setSel(k.id)}>
                <div className="name">{k.name}</div>
                <div className="val">{k.val}</div>
              </div>
            ))}
          </div>
        </section>
      }
      wid={<WhatIveDone scope={selected.name} day="Lun 13" items={[
        { t: '14:18', a: `KPI crafting "${selected.name}"` },
        { t: '14:18', a: 'Calculation from Golden source columns' },
      ]} />}
      footer={<Footer placeholder="Propose une analyse…" action={<Link className="btn" to="/board">Retour Board</Link>} />}
    />
  )
}
