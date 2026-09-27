import { Link } from 'react-router-dom'
import { Footer, Shell3, WhatIveDone } from '../components/Shell'
export default function AddFiles() {
  return (
    <Shell3
      center={
        <section className="panel">
          <div className="panel-title">Sources brutes</div>
          <div className="lab-toolbar">
            <button className="btn" type="button">Ajouter un chemin (path)</button>
            <button className="btn" type="button">Ajouter un fichier (drop)</button>
            <span style={{ flex: 1 }} />
            <span style={{ fontSize: 12, color: '#71717a' }}>lazy · 3 / 10</span>
          </div>
          <div className="dropzone">Drop fichiers ici · lecture lazy</div>
          <ul className="file-list">
            <li><span>tournees.csv · CSV · ~2M (lazy)</span><span>prêt</span></li>
            <li><span>couts.parquet · PARQUET · ~2M (lazy)</span><span>prêt</span></li>
            <li><span>zones.xlsx · XLSX · ~2M (lazy)</span><span>prêt</span></li>
          </ul>
        </section>
      }
      wid={<WhatIveDone scope="Global" day="Lun 13" items={[
        { t: '14:02', a: 'Start draft' },
        { t: '14:05', a: 'Import data' },
      ]} />}
      footer={<Footer placeholder="Demande à l'IA une action sur les données…" action={<Link className="btn primary" to="/forge">Vers Forge</Link>} />}
    />
  )
}
