
import { Link } from 'react-router-dom'
import { Footer, Shell3, WhatIveDone } from '../components/Shell'
export default function Laboratoire() {
  return (
    <Shell3
      center={
        <section className="panel">
          <div className="panel-title">Laboratoire</div>
          <div className="lab-toolbar">
            <span className="file">tournées.csv</span>
            <button className="btn" type="button">Ajouter path</button>
            <button className="btn" type="button">Ajouter fichier</button>
            <span style={{ flex: 1 }} />
            <button className="btn" type="button">Filter</button>
            <button className="btn" type="button">Sort</button>
            <button className="btn" type="button">SUM</button>
            <button className="btn" type="button">IF</button>
          </div>
          <div className="formula-bar"><span className="fx">fx</span><input defaultValue="=C2" /></div>
          <div className="grid-wrap">
            <table className="sheet">
              <thead>
                <tr><th className="corner" /><th>A</th><th>B</th><th>C</th><th>D</th><th>E</th><th>F</th></tr>
                <tr><th className="corner" /><th>ID_tournée</th><th>Date</th><th>Chauffeur</th><th>Véhicule</th><th>Km</th><th>Livraisons</th></tr>
              </thead>
              <tbody>
                <tr><td className="rownum">1</td><td>TRN001</td><td>02/05/2024</td><td className="selected">Martin</td><td>VU-23</td><td>142</td><td>18</td></tr>
                <tr><td className="rownum">2</td><td>TRN002</td><td>02/05/2024</td><td>Dubois</td><td>VU-07</td><td>98</td><td>12</td></tr>
                <tr><td className="rownum">3</td><td>TRN003</td><td>03/05/2024</td><td>Bernard</td><td>VU-23</td><td>210</td><td>24</td></tr>
              </tbody>
            </table>
          </div>
        </section>
      }
      wid={<WhatIveDone scope="tournées.csv" day="Lun 13" items={[
        { t: '14:06', a: 'Cleaning columns (date, zone, km, cout)' },
        { t: '14:07', a: 'Dropping column (notes)' },
        { t: '14:08', a: 'Duplicated values' },
        { t: '14:12', a: 'Join with coûts' },
        { t: '14:18', a: 'KPI crafting "écart_zone_critique"' },
      ]} />}
      footer={<Footer placeholder="Demande à l'IA une action sur les données…" action={<Link className="btn primary" to="/golden">Vers Frame B — Golden source</Link>} />}
    />
  )
}
