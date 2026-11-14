import React, { useEffect, useState } from 'react';
import { api, datetime } from '../lib/api';
import { Panel, Table, Modal } from './ui';
export default function AssetIncidents({ data, user }) {
  const [rows, setRows] = useState([]),
    [modal, setModal] = useState(null),
    [asset, setAsset] = useState(''),
    [note, setNote] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const load = () =>
    api('/asset-incidents')
      .then(setRows)
      .catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (modal === 'new') await api('/asset-incidents', { asset_id: asset, description: note });
      else await api(`/asset-incidents/${modal.id}/resolve`, { resolution: note });
      setModal(null);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Panel
        title="Fallas y mantenimiento de activos"
        subtitle="Reporta daños, equipos fuera de servicio y su solución; cada acción queda en auditoría."
        action={
          user.permissions.includes('activo.reportar') && (
            <button
              className="primary-button"
              onClick={() => {
                setModal('new');
                setAsset('');
                setNote('');
                setError('');
              }}
            >
              Reportar falla
            </button>
          )
        }
      >
        <Table
          rows={rows}
          columns={[
            { label: 'Activo', key: 'asset_name' },
            { label: 'Sucursal', key: 'branch_name' },
            { label: 'Falla', key: 'description' },
            { label: 'Reportó', key: 'reporter' },
            { label: 'Fecha', render: (r) => datetime(r.created_at) },
            { label: 'Estado', key: 'status' },
            { label: 'Solución', key: 'resolution' },
            ...(user.permissions.includes('activo.gestionar')
              ? [
                  {
                    label: 'Acción',
                    render: (r) =>
                      r.status !== 'Resuelta' && (
                        <button
                          className="table-button"
                          onClick={() => {
                            setModal(r);
                            setNote('');
                            setError('');
                          }}
                        >
                          Registrar solución
                        </button>
                      ),
                  },
                ]
              : []),
          ]}
        />
      </Panel>
      {!modal && error && <p className="form-error">{error}</p>}
      {modal && (
        <Modal
          title={modal === 'new' ? 'Reportar falla de activo' : 'Resolver falla de activo'}
          onClose={() => setModal(null)}
        >
          <form onSubmit={save} className="incident-form">
            {modal === 'new' && (
              <label>
                Activo
                <select required value={asset} onChange={(e) => setAsset(e.target.value)}>
                  <option value="">Selecciona el activo</option>
                  {data.assets.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} · {a.code}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label>
              {modal === 'new' ? 'Descripción de la falla' : 'Solución aplicada'}
              <textarea
                required
                minLength={5}
                maxLength={1000}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
            {error && (
              <p role="alert" className="form-error">
                {error}
              </p>
            )}
            <button className="primary-button" disabled={busy}>
              Guardar reporte
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
