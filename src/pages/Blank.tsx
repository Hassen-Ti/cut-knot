
import { Link } from 'react-router-dom'
import { Footer, Shell3, WhatIveDone } from '../components/Shell'
export default function Blank() {
  return (
    <Shell3
      center={
        <section className="panel">
          <div className="panel-title">Nouveau board — sans data</div>
          <div className="canvas-area">
            <div className="sticky">Hypothèse coût zone</div>
            <div className="sticky">Idée: frets vs tournées</div>
            <div className="sticky">À expliquer à Marc</div>
          </div>
        </section>
      }
      wid={<WhatIveDone scope="Global" day="Lun 13" items={[
        { t: '14:02', a: 'Start draft' },
        { t: '14:03', a: 'Open canvas' },
        { t: '14:05', a: 'Exploration' },
      ]} />}
      footer={<Footer placeholder="Aide-moi à structurer mes idées…" action={<Link className="btn primary" to="/add-files">Ajouter des fichiers</Link>} />}
    />
  )
}
