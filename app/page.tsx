'use client';

import { useState } from 'react';

export default function Home() {
  const [folder, setFolder] = useState('');
  const [status, setStatus] = useState('Listo para configurar Drive y lanzar el primer lote.');

  async function check() {
    setStatus(folder.trim() ? 'Configuración recibida. El siguiente paso es conectar el worker ND.' : 'Ingresá el ID de la carpeta madre de Google Drive.');
  }

  return <main className="shell">
    <div className="eyebrow">ARKON · ND</div>
    <h1 className="title">Extractor documental</h1>
    <p className="subtitle">Sistema independiente para recorrer PDFs, extraer entidades y conservar información documental exhaustiva en Google Sheets. ARKON y NE quedan fuera de este servicio.</p>

    <section className="grid">
      <div className="card"><h2>Fuente</h2><div className="value">Google Drive</div><div className="muted">PDFs originales sin modificar</div></div>
      <div className="card"><h2>Extracción</h2><div className="value">ND exhaustiva</div><div className="muted">entidad → aspecto → dato + evidencia</div></div>
      <div className="card"><h2>Destino</h2><div className="value">Google Sheets</div><div className="muted">una estructura documental por libro/PDF</div></div>
    </section>

    <section className="panel">
      <h2>Configurar primera fuente</h2>
      <p className="muted">Pegá el ID de la carpeta madre de Drive. No hace falta subir los PDFs al sitio.</p>
      <div className="row">
        <input className="input" value={folder} onChange={e=>setFolder(e.target.value)} placeholder="ID de carpeta de Google Drive" />
        <button className="btn" onClick={check}>Verificar</button>
      </div>
      <div className="status">{status}</div>
    </section>

    <section className="panel">
      <h2>Estado</h2>
      <p className="muted">La interfaz ya está separada del código de ARKON. Ahora vamos a conectar el worker, checkpoints, límites diarios y escritura por lotes.</p>
    </section>
  </main>;
}
