import React, { useEffect, useState } from 'react';
import {
  Store,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock,
  ShieldCheck,
  Download,
} from 'lucide-react';
import { CircleMarker, useMapEvents, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import '../portal.css';
export const money = (n) =>
  new Intl.NumberFormat('es-GT', { style: 'currency', currency: 'GTQ' }).format(n / 100);
const when = (date) =>
  new Intl.DateTimeFormat('es-GT', {
    timeZone: 'America/Guatemala',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(date));
export async function request(path, body) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch('/api/portal' + path, {
      method: body ? 'POST' : 'GET',
      credentials: 'omit',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    let out;
    try {
      out = await response.json();
    } catch {
      throw new Error(
        'El servidor no respondió correctamente. Reinicia FarmaCali e intenta nuevamente.',
      );
    }
    if (response.status === 401 || (response.status === 404 && path === '/catalog'))
      throw new Error(
        'El portal no está disponible en esta versión del servidor. Reinicia FarmaCali y vuelve a intentar.',
      );
    if (!response.ok) {
      const field = out.fields && Object.keys(out.fields)[0];
      const detail = field === 'dpi'
        ? 'Ingresa un CUI/DPI válido de 13 dígitos.'
        : out.fields && Object.values(out.fields)[0];
      throw new Error(detail || out.error || 'No pudimos completar la solicitud. Intenta nuevamente.');
    }
    return out;
  } catch (error) {
    if (error.name === 'AbortError')
      throw new Error('La consulta tardó demasiado. Revisa la conexión e intenta nuevamente.');
    if (error instanceof TypeError)
      throw new Error(
        'No pudimos conectar con FarmaCali. Comprueba que el servidor esté encendido e intenta nuevamente.',
      );
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
export function LocationPin({ location, onChange }) {
  const map = useMap();
  useMapEvents({ click: (e) => onChange({ lat: e.latlng.lat, lng: e.latlng.lng }) });
  useEffect(() => {
    if (location) map.setView([location.lat, location.lng], 13, { animate: false });
  }, [location, map]);
  return location ? (
    <CircleMarker
      center={[location.lat, location.lng]}
      radius={10}
      pathOptions={{ color: '#7838ed', fillOpacity: 0.6 }}
    />
  ) : null;
}
export function Receipt({ receipt, onNew, authorizationCode, onRefresh }) {
  async function save() {
    const canvas=document.createElement('canvas'); const width=900; const lineHeight=34; canvas.width=width; canvas.height=610+receipt.items.length*lineHeight; const ctx=canvas.getContext('2d');
    ctx.fillStyle='#f7f4fb';ctx.fillRect(0,0,width,canvas.height);ctx.fillStyle='#fff';ctx.roundRect(24,24,width-48,canvas.height-48,24);ctx.fill();ctx.fillStyle='#5c2aa9';ctx.font='700 30px system-ui';ctx.fillText('FarmaCali',64,82);ctx.fillStyle='#6c6280';ctx.font='18px system-ui';ctx.fillText('Recibo digital · conserva tu ticket',64,116);ctx.fillStyle='#33234f';ctx.font='700 42px system-ui';ctx.fillText(receipt.ticket,64,190);ctx.fillStyle='#6c6280';ctx.font='18px system-ui';ctx.fillText('Número de ticket',64,158);ctx.fillStyle='#33234f';ctx.font='700 22px system-ui';ctx.fillText(receipt.branch_name||'Sucursal FarmaCali',64,250);ctx.font='18px system-ui';ctx.fillStyle='#6c6280';ctx.fillText(receipt.fulfillment==='pickup'?'Retiro en sucursal':'Entrega a domicilio',64,280);
    let y=340; for(const item of receipt.items){ctx.fillStyle='#33234f';ctx.font='18px system-ui';ctx.fillText(item.name+' × '+item.quantity,64,y);ctx.textAlign='right';ctx.fillText(money(item.quantity*item.unit_price_cents),width-64,y);ctx.textAlign='left';y+=lineHeight;} ctx.strokeStyle='#e7def2';ctx.beginPath();ctx.moveTo(64,y+8);ctx.lineTo(width-64,y+8);ctx.stroke();ctx.fillStyle='#33234f';ctx.font='700 24px system-ui';ctx.fillText('Total',64,y+52);ctx.textAlign='right';ctx.fillText(money(receipt.total_cents),width-64,y+52);ctx.textAlign='left';ctx.fillStyle='#6c6280';ctx.font='16px system-ui';ctx.fillText('Presenta este ticket o tu QR al recoger.',64,canvas.height-72);
    if(receipt.qr){const image=new Image();await new Promise(resolve=>{image.onload=resolve;image.onerror=resolve;image.src=receipt.qr;});if(image.naturalWidth)ctx.drawImage(image,width-250,126,160,160);} const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)return;const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download=receipt.ticket+'.png';link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);
  }
  const pickup = receipt.fulfillment === 'pickup';
  const steps = ['Pendiente', 'Preparando', pickup ? 'Listo para recoger' : 'En ruta', 'Entregado'];
  const index = steps.indexOf(receipt.status);
  return (
    <section className="pp-receipt" aria-label="Tu ticket de pedido">
      <div className="pp-ticket-heading">
        <span className="pp-big-check">
          <CheckCircle2 size={34} />
        </span>
        <div>
          <span className="pp-eyebrow">TU PEDIDO EN FARMACALI</span>
          <h2>{receipt.access_code ? '¡Pedido confirmado!' : 'Estado de tu pedido'}</h2>
          <p>Conserva tu ticket y guarda una captura de este recibo.</p>
        </div>
      </div>
      <div className="fc-ticket-pass">
        <div className="pp-ticket-number">
          <div>
            <small>Número de ticket</small>
            <strong>{receipt.ticket}</strong>
          </div>
          {false && receipt.access_code && (
            <div>
              <small>Código de autorización · guárdalo</small>
              <code>{receipt.access_code}</code>
            </div>
          )}
        </div>
        {receipt.qr && (
          <figure className="fc-ticket-qr">
            <img src={receipt.qr} alt="QR de tu pedido" />
            <figcaption>
              Tu QR del pedido<small>Guarda una captura o descarga tu ticket.</small>
            </figcaption>
          </figure>
        )}
      </div>
      <div
        className={'pp-order-status ' + (receipt.status === 'Cancelado' ? 'pp-cancelled' : '')}
        role="status"
      >
        {receipt.status === 'Cancelado'
          ? 'Pedido cancelado'
          : receipt.status === 'Pendiente'
            ? 'Pedido recibido'
            : receipt.status}
      </div>
      {receipt.status !== 'Cancelado' && (
        <ol className="pp-tracking">
          {steps.map((s, i) => (
            <li key={s} className={i <= index ? 'complete' : ''}>
              <span>{i < index ? <Check size={14} /> : i + 1}</span>
              {s === 'Pendiente' ? 'Recibido' : s}
            </li>
          ))}
        </ol>
      )}
      <p className="pp-receipt-guidance">
        {receipt.status === 'Cancelado'
          ? 'La reserva ya no está activa. Puedes crear un nuevo pedido y consultar las existencias disponibles.'
          : receipt.status === 'Entregado'
            ? 'Tu pedido fue entregado. Gracias por elegir FarmaCali.'
            : pickup
              ? receipt.status === 'Listo para recoger'
                ? 'Tu pedido está listo. Presenta el ticket o el QR en la sucursal.'
                : 'Estamos coordinando tu pedido. Consulta aquí hasta que aparezca “Listo para recoger” antes de ir a la sucursal.'
              : 'Consulta aquí el avance de tu entrega. El tiempo mostrado es estimado y puede cambiar durante la preparación.'}
      </p>
      <div className="pp-receipt-details">
        <div>
          <Store size={20} />
          <div>
            <small>{pickup ? 'Recoger en' : 'Sucursal que atiende'}</small>
            <strong>{receipt.branch_name}</strong>
            <p>
              {receipt.branch_address} · {receipt.department}
            </p>
            <p>
              Horario: {receipt.opens_at}–{receipt.closes_at}
            </p>
          </div>
        </div>
        <div>
          <Clock size={20} />
          <div>
            <small>Pedido iniciado · Hora de Guatemala</small>
            <strong>{when(receipt.created_at)}</strong>
            {receipt.expires_at && (
              <p>Vence: {when(receipt.expires_at)}</p>
            )}
          </div>
        </div>
      </div>
      <div className="pp-ticket-items">
        {receipt.items.map((i) => (
          <div key={i.name}>
            <span>
              {i.name} <small>× {i.quantity}</small>
            </span>
            <strong>{money(i.quantity * i.unit_price_cents)}</strong>
          </div>
        ))}
        <div className="pp-ticket-total">
          <span>Total del pedido</span>
          <strong>{money(receipt.total_cents)}</strong>
        </div>
        <p>
          {receipt.payment} al recibir. No se realiza ningún cobro en línea.
          {!pickup &&
            ' El costo de envío, si aplica, se coordina con la sucursal antes del despacho.'}
        </p>
      </div>
      {receipt.delivery_tracking && (
        <section className="fc-tracking-location">
          <strong>Repartidor: {receipt.delivery_tracking.courier}</strong>
          <p>
            {receipt.delivery_tracking.updated_at
              ? `${receipt.delivery_tracking.source} · última ubicación ${when(receipt.delivery_tracking.updated_at)}`
              : 'Entrega asignada. El repartidor aún no comparte ubicación.'}
          </p>
          {receipt.delivery_tracking.lat != null && (
            <p>
              Ubicación compartida: {Number(receipt.delivery_tracking.lat).toFixed(5)},{' '}
              {Number(receipt.delivery_tracking.lng).toFixed(5)}.{' '}
              {receipt.delivery_tracking.source === 'Simulación'
                ? 'Recorrido de demostración, no GPS real.'
                : ''}
            </p>
          )}
        </section>
      )}
      {authorizationCode && ['Pendiente', 'Preparando'].includes(receipt.status) && (
        <CancelPortalOrder ticket={receipt.ticket} code={authorizationCode} onChanged={onRefresh} />
      )}
      {receipt.prescription_status === 'Rechazada' && receipt.status === 'Pendiente' && (
        <RecipeReplacement
          ticket={receipt.ticket}
          accessCode={authorizationCode}
          onChanged={onRefresh}
        />
      )}
      {receipt.items.some((i) => i.prescription) &&
        !['Entregado', 'Cancelado'].includes(receipt.status) && (
          <p className="pp-notice">
            <ShieldCheck size={18} />
            {receipt.prescription_status === 'Revisada'
              ? 'Receta revisada y aprobada. La farmacia puede preparar tu pedido.'
              : receipt.prescription_status === 'Rechazada'
                ? 'Receta rechazada: ' +
                  receipt.prescription_notes +
                  '. Puedes adjuntar una nueva foto aquí antes de la preparación.'
                : 'Receta pendiente de revisión. El personal la revisará antes de preparar tu pedido.'}
          </p>
        )}
      {false && receipt.access_code && (
        <p className="pp-notice">
          El código de autorización solo se muestra al confirmar. Descarga tu ticket: lo necesitarás
          para consultar el pedido y recogerlo.
        </p>
      )}
      <div className="pp-receipt-actions">
        <button className="pp-primary" onClick={save}>
          <Download size={17} />
          Descargar recibo como imagen
        </button>
        <button className="pp-text" onClick={onNew}>
          Hacer otro pedido
          <ArrowRight size={16} />
        </button>
      </div>
    </section>
  );
}
function RecipeReplacement({ ticket, accessCode, onChanged }) {
  const [image, setImage] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  async function select(file) {
    setImage('');
    setError('');
    if (!file) return;
    if (
      !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) ||
      file.size > 2 * 1024 * 1024
    ) {
      setError('Elige una foto JPG, PNG o WebP de máximo 2 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setImage(reader.result);
    reader.onerror = () => setError('No se pudo leer la imagen.');
    reader.readAsDataURL(file);
  }
  async function send() {
    setBusy(true);
    setError('');
    try {
      await request('/prescription', {
        ticket,
        access_code: accessCode,
        prescription_image: image,
      });
      await onChanged?.();
      setImage('');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="fc-recipe-replace">
      <h3>Reemplaza tu receta</h3>
      <p>
        Sube una foto clara y completa. El personal volverá a revisarla antes de preparar el pedido.
      </p>
      <label>
        Nueva foto de receta
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={(e) => select(e.target.files?.[0])}
        />
      </label>
      <button className="pp-primary" disabled={!image || busy} onClick={send}>
        Enviar nueva receta a revisión
      </button>
      {error && (
        <p role="alert" className="pp-error">
          {error}
        </p>
      )}
    </section>
  );
}

function CancelPortalOrder({ ticket, code, onChanged }) {
  const [open, setOpen] = useState(false),
    [reason, setReason] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  return (
    <section className="portal-cancel">
      <button type="button" className="pp-secondary" onClick={() => setOpen(!open)}>
        Cancelar este pedido
      </button>
      {open && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError('');
            try {
              await request('/cancel', { ticket, access_code: code, reason });
              await onChanged?.();
            } catch (e) {
              setError(e.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <p>
            Desde la sexta cancelación del cliente se bloquean nuevos pedidos por celular o DPI
            registrado. Las cancelaciónes de la farmacia y reservas vencidas no cuentan.
          </p>
          <label>
            Motivo de cancelación
            <textarea
              required
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          {error && (
            <p role="alert" className="pp-error">
              {error}
            </p>
          )}
          <button className="pp-primary" disabled={busy}>
            {busy ? 'Cancelando...' : 'Confirmar cancelación'}
          </button>
        </form>
      )}
    </section>
  );
}
