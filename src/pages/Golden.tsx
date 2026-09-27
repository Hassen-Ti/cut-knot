import { Link } from 'react-router-dom'
import { Footer, Shell3, WhatIveDone } from '../components/Shell'
export default function Golden() {
  return (
    <Shell3
      center={
        <section className="panel">
          <div className="panel-title">Golden source</div>
          <div className="join-chips">
            <span className="chip">tournées</span>
            <span className="chip">coûts</span>
            <span className="chip">zones</span>
          </div>
          <div className="formula-bar"><span className="fx">fx</span><input defaultValue="=E2/D2" /></div>
          <div className="grid-wrap">
            <table className="sheet">
              <thead>
                <tr><th className="corner" /><th>tournée_id</th><th>zone</th><th>km</th><th>coût</th><th>coût_par_km</th></tr>
              </thead>
              <tbody>
                <tr><td className="rownum">1</td><td>TRN001</td><td>Nord</td><td>142</td><td>380</td><td className="selected">2.68</td></tr>
                <tr><td className="rownum">2</td><td>TRN002</td><td>Sud</td><td>98</td><td>210</td><td>2.14</td></tr>
              </tbody>
            </table>
          </div>
        </section>
      }
      wid={<WhatIveDone scope="Golden source" day="Lun 13" items={[
        { t: '14:12', a: 'Join with coûts' },
        { t: '14:13', a: 'Join with zones' },
        { t: '14:15', a: 'Data transformation' },
      ]} />}
      footer={<Footer placeholder="Aide-moi sur les jointures…" action={<Link className="btn primary" to="/kpi">Vers KPI</Link>} />}
    />
  )
}
