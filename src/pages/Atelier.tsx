
import { Link } from 'react-router-dom'
import { Footer, Shell3, WhatIveDone } from '../components/Shell'
export default function Atelier() {
  return (
    <Shell3
      center={
        <section className="panel">
          <div className="panel-title">Atelier</div>
          <div className="canvas-area">
            <Link className="frame-card" to="/laboratoire"><h3>Laboratoire</h3><div className="block">Jeu de données 1</div><div className="block">Jeu de données 2</div><div className="block">Jeu de données 3</div></Link>
            <span className="arrow">→</span>
            <Link className="frame-card" to="/golden"><h3>Golden source</h3><div className="block">Source unique consolidée</div></Link>
            <span className="arrow">→</span>
            <Link className="frame-card" to="/kpi"><h3>KPI</h3><div className="block">KPI 1</div><div className="block">KPI 2</div><div className="block">KPI 3</div></Link>
          </div>
        </section>
      }
      wid={<WhatIveDone scope="Global" day="Lun 13" items={[
        { t: '14:02', a: 'Start draft' },
        { t: '14:05', a: 'Import data' },
        { t: '14:08', a: 'Open canvas' },
        { t: '14:12', a: 'Data transformation' },
        { t: '14:20', a: 'Exploration' },
      ]} />}
      footer={<Footer placeholder="Propose une analyse…" action={<Link className="btn primary" to="/kpi">Vers KPI</Link>} />}
    />
  )
}
