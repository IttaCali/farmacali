import MapTiles from './MapTiles.jsx';
import BrandMark from './BrandMark.jsx';
import React, { useEffect, useRef, useState } from 'react';
import {
  Pill,
  Search,
  Store,
  Ticket,
  ArrowLeft,
  ArrowRight,
  Plus,
  Minus,
  Trash2,
  ShoppingBag,
  LoaderCircle,
  MapPin,
  LocateFixed,
  ShieldCheck,
  Clock3,
  Check,
  Sparkles,
} from 'lucide-react';
import { MapContainer, TileLayer } from 'react-leaflet';
import { request, money, Receipt, LocationPin } from './PublicPortal.jsx';
import { validGuatemalanCui } from '../../shared/guatemalan-cui.js';
import '../portal.css';

function QuantityPicker({ name, value, max, onChange, catalog = false }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  return (
    <div className="fc-quantity">
      <button
        type="button"
        aria-label={(catalog ? 'Restar en catálogo ' : 'Restar ') + name}
        onClick={() => onChange(value - 1)}
      >
        <Minus size={16} />
      </button>
      <input
        aria-label={(catalog ? 'Cantidad en catálogo de ' : 'Cantidad de ') + name}
        inputMode="numeric"
        type="number"
        min="1"
        max={max}
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          const n = Number(e.target.value);
          if (Number.isInteger(n) && n >= 1 && n <= max) onChange(n);
        }}
        onBlur={() => {
          const n = Math.max(1, Math.min(max, Math.trunc(Number(draft) || 1)));
          setDraft(String(n));
          onChange(n);
        }}
      />
      <button
        type="button"
        aria-label={(catalog ? 'Sumar en catálogo ' : 'Sumar ') + name}
        disabled={value >= max}
        onClick={() => onChange(value + 1)}
      >
        <Plus size={16} />
      </button>
    </div>
  );
}

export default function CustomerPortal() {
  const [catalog, setCatalog] = useState(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const [tab, setTab] = useState('order'),
    [step, setStep] = useState(0),
    [branch, setBranch] = useState(null),
    [query, setQuery] = useState(''),
    [department, setDepartment] = useState('Todos'),
    [cart, setCart] = useState([]);
  const [mode, setMode] = useState('pickup'),
    [location, setLocation] = useState(null),
    [photo, setPhoto] = useState(''),
    [photoName, setPhotoName] = useState(''),
    [geoBusy, setGeoBusy] = useState(false);
  const [details, setDetails] = useState({
      customer: '',
      dpi: '',
      phone: '',
      address: '',
      payment: 'Efectivo',
    }),
    [receipt, setReceipt] = useState(null),
    [lookup, setLookup] = useState({ ticket: '' }),
    [tracked, setTracked] = useState(null);
  const attempt = useRef(crypto.randomUUID()),
    top = useRef(null);
  useEffect(() => {
    document.documentElement.removeAttribute('data-theme');
    document.title = 'FarmaCali · Haz tu pedido';
    load();
  }, []);
  async function load() {
    setLoading(true);
    setError('');
    try {
      setCatalog(await request('/catalog'));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }
  function move(n) {
    setStep(n);
    setError('');
    setTimeout(() => top.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 0);
  }
  function invalidate() {
    attempt.current = crypto.randomUUID();
  }
  function update(k, v) {
    setDetails((d) => ({ ...d, [k]: v }));
    invalidate();
  }
  const stock = (p) =>
    Boolean(
      catalog?.availability?.find((a) => a.branch_id === branch?.id && a.product_id === p.id)
        ?.available,
    );
  const total = cart.reduce((n, i) => n + i.quantity * i.price_cents, 0),
    needsRx = cart.some((i) => i.prescription);
  function quantity(p, n) {
    const limit = stock(p) ? 100 : 0;
    n = Math.max(0, Math.min(limit, Math.trunc(Number(n) || 0)));
    if (n && !cart.some((i) => i.id === p.id) && cart.length >= 20) {
      setError('Puedes agregar hasta 20 medicamentos distintos.');
      return;
    }
    setCart((c) =>
      n
        ? c.some((i) => i.id === p.id)
          ? c.map((i) => (i.id === p.id ? { ...i, quantity: n } : i))
          : [...c, { ...p, quantity: n }]
        : c.filter((i) => i.id !== p.id),
    );
    invalidate();
  }
  function reset() {
    setReceipt(null);
    setTracked(null);
    setCart([]);
    setBranch(null);
    setStep(0);
    setQuery('');
    setPhoto('');
    setPhotoName('');
    setDetails({ customer: '', dpi: '', phone: '', address: '', payment: 'Efectivo' });
    setLocation(null);
    setMode('pickup');
    setTab('order');
    invalidate();
    load();
  }
  async function upload(file) {
    invalidate();
    setPhoto('');
    setPhotoName('');
    setError('');
    if (!file) return;
    if (
      !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
      file.size > 2 * 1024 * 1024
    ) {
      setError('Elige una foto JPG, PNG o WebP de máximo 2 MB.');
      return;
    }
    try {
      const value = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = reject;
        r.readAsDataURL(file);
      });
      setPhoto(value);
      setPhotoName(file.name);
    } catch {
      setError('No se pudo leer la foto. Intenta con otra imagen.');
    }
  }
  function locate() {
    setGeoBusy(true);
    setError('');
    navigator.geolocation?.getCurrentPosition(
      (p) => {
        setLocation({ lat: p.coords.latitude, lng: p.coords.longitude });
        invalidate();
        setGeoBusy(false);
      },
      () => {
        setError('No pudimos obtener tu ubicación. Puedes marcarla tocando el mapa.');
        setGeoBusy(false);
      },
      { timeout: 12000, enableHighAccuracy: true },
    );
    if (!navigator.geolocation) {
      setGeoBusy(false);
      setError('Marca tu ubicación en el mapa.');
    }
  }
  async function submit(e) {
    e.preventDefault();
    if (!details.dpi || details.dpi.length !== 13) {
      setError('El CUI/DPI es obligatorio para confirmar tu pedido.');
      return;
    }
    if (!validGuatemalanCui(details.dpi)) {
      setError(
        'El CUI/DPI no es válido. Revisa el dígito verificador y los códigos de departamento y municipio.',
      );
      return;
    }
    if (false) {
      setError('Completa el código de verificación del teléfono.');
      return;
    }
    setError('');
    if (!cart.length || !branch) {
      setError('Selecciona sucursal y medicamentos.');
      return;
    }
    if (needsRx && !photo) {
      setError('Sube una foto de tu receta para los medicamentos que la requieren.');
      return;
    }
    if (mode === 'delivery' && !location) {
      setError('Marca en el mapa dónde quieres recibir tu pedido.');
      return;
    }
    setBusy(true);
    try {
      const out = await request('/orders', {
        request_id: attempt.current,
        branch_id: branch.id,
        items: cart.map((i) => ({ product_id: i.id, quantity: i.quantity })),
        fulfillment: mode,
        ...details,
        ...(mode === 'delivery' ? location : { address: undefined }),
        ...(needsRx ? { prescription_image: photo } : {}),
      });
      setReceipt(out);
      setLookup({ ticket: out.ticket });
      setPhoto('');
      setPhotoName('');
      setTimeout(() => top.current?.scrollIntoView({ block: 'start' }), 0);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function consult(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setTracked(null);
    try {
      setTracked(await request('/lookup', lookup));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const stepNames = ['Sucursal', 'Medicamentos', 'Datos y confirmación'];
  const basket = (checkout = false) => (
    <aside className="fc-basket" aria-label="Tu cesta">
      <h2>
        <ShoppingBag size={21} />
        Tu pedido <span>{cart.length}</span>
      </h2>
      <p className="fc-subtle">{branch?.name}</p>
      {!cart.length ? (
        <p className="fc-empty">
          Agrega los medicamentos que necesitas. Aquí verás las cantidades y el total.
        </p>
      ) : (
        <ul className="fc-cart-lines">
          {cart.map((i) => (
            <li key={i.id}>
              <div className="fc-line-title">
                <strong>{i.name}</strong>
                <button
                  type="button"
                  aria-label={'Quitar ' + i.name}
                  onClick={() => quantity(i, 0)}
                >
                  <Trash2 size={17} />
                </button>
              </div>
              <small>
                {money(i.price_cents)} por unidad{Boolean(i.prescription) && ' · Con receta'}
              </small>
              <div className="fc-line-bottom">
                <QuantityPicker
                  name={i.name}
                  value={i.quantity}
                  max={100}
                  onChange={(n) => quantity(i, n)}
                />
                <strong>{money(i.price_cents * i.quantity)}</strong>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="fc-total" aria-live="polite">
        <span>Total del pedido</span>
        <strong>{money(total)}</strong>
      </div>
      <small>Pagas al recibir. Sin cobro en línea.</small>
      {!checkout && (
        <button className="pp-primary fc-wide" disabled={!cart.length} onClick={() => move(2)}>
          Continuar con mis datos <ArrowRight size={17} />
        </button>
      )}
    </aside>
  );
  return (
    <div className="public-portal fc-simple">
      <header className="pp-header">
        <a className="pp-brand" href="/portal">
          <span>
            <BrandMark />
          </span>
          <div>
            Farma<b>Cali</b>
            <small>Tu farmacia, más cerca</small>
          </div>
        </a>
        <nav aria-label="Portal del cliente">
          <button
            className={tab === 'order' ? 'active' : ''}
            onClick={() => {
              setTab('order');
              setError('');
            }}
          >
            <ShoppingBag size={18} />
            Hacer pedido
          </button>
          <button
            className={tab === 'lookup' ? 'active' : ''}
            onClick={() => {
              setTab('lookup');
              setError('');
            }}
          >
            <Ticket size={18} />
            Consultar ticket
          </button>
        </nav>
        <span className="pp-header-note">
          <ShieldCheck size={16} />
          Sin usuario ni contraseña
        </span>
      </header>
      <main className="pp-main" ref={top}>
        {tab === 'lookup' ? (
          <section className="fc-lookup">
            <h1>Consulta tu pedido</h1>
            <p>Escribe tu número de ticket para ver el estado del pedido.</p>
            <form className="fc-form" onSubmit={consult}>
              <label>
                Número de ticket
                <input
                  required
                  value={lookup.ticket}
                  placeholder="FC-A12B34"
                  maxLength={15}
                  autoCapitalize="characters"
                  onChange={(e) =>
                    setLookup({ ...lookup, ticket: e.target.value.toUpperCase().trim() })
                  }
                />
              </label>
              <label>
                Código de autorización
                <input
                  value={lookup.access_code || ''}
                  required={false}
                  placeholder="6 números"
                  autoComplete="off"
                  maxLength={24}
                  onChange={(e) =>
                    setLookup({ ...lookup, access_code: e.target.value.toUpperCase().trim() })
                  }
                />
              </label>
              <button className="pp-primary" disabled={busy}>
                {busy ? 'Consultando…' : 'Consultar pedido'}
              </button>
            </form>
            {error && (
              <div className="pp-error" role="alert">
                {error}
              </div>
            )}
            {tracked && (
              <Receipt
                key={tracked.ticket}
                receipt={tracked}
                onNew={reset}
                authorizationCode={lookup.access_code}
                onRefresh={async () => setTracked(await request('/lookup', lookup))}
              />
            )}
          </section>
        ) : receipt ? (
          <Receipt
            receipt={receipt}
            onNew={reset}
            authorizationCode={receipt.access_code}
            onRefresh={async () =>
              setReceipt({
                ...(await request('/lookup', {
                  ticket: receipt.ticket,
                  access_code: receipt.access_code,
                })),
                access_code: receipt.access_code,
              })
            }
          />
        ) : (
          <>
            {step === 0 && (
              <section className="fc-welcome" aria-label="Cómo funciona FarmaCali">
                <div className="fc-welcome-copy">
                  <span className="fc-kicker">
                    <span />
                    TU FARMACIA, A TU RITMO
                  </span>
                  <h2>
                    Menos tiempo en fila.
                    <br />
                    <em>Más tiempo para ti.</em>
                  </h2>
                  <p>
                    Pide tus medicamentos en FarmaCali y espera la confirmación para recogerlos en
                    tu farmacia o stand. También puedes solicitar entrega en casa.
                  </p>
                  <div className="fc-welcome-notes">
                    <span>
                      <Check size={15} />
                      Sin crear una cuenta
                    </span>
                    <span>
                      <Clock3 size={15} />
                      Consulta el avance con tu ticket
                    </span>
                  </div>
                </div>
                <div className="fc-order-journey" aria-label="Elige, pide y recoge">
                  <div className="fc-journey-caption">
                    <span>ASÍ DE FÁCIL</span>
                    <ShoppingBag size={20} />
                  </div>
                  <div className="fc-journey-icons">
                    <div>
                      <span>
                        <Store size={24} />
                      </span>
                      <strong>Elige</strong>
                      <small>tu sucursal</small>
                    </div>
                    <ArrowRight size={18} />
                    <div>
                      <span>
                        <Pill size={24} />
                      </span>
                      <strong>Pide</strong>
                      <small>lo que necesitas</small>
                    </div>
                    <ArrowRight size={18} />
                    <div>
                      <span>
                        <ShoppingBag size={24} />
                      </span>
                      <strong>Recoge</strong>
                      <small>cuando esté listo</small>
                    </div>
                  </div>
                  <p>Tu bolsa lista. Tu tiempo de vuelta.</p>
                </div>
              </section>
            )}
            <ol className="fc-steps" aria-label="Pasos del pedido">
              {stepNames.map((s, i) => (
                <li
                  key={s}
                  aria-current={step === i ? 'step' : undefined}
                  className={step === i ? 'active' : step > i ? 'done' : ''}
                >
                  <span>{i + 1}</span>
                  {s}
                </li>
              ))}
            </ol>
            {error && (
              <div className="pp-error" role="alert">
                {error}
              </div>
            )}
            {loading ? (
              <div className="pp-loading" role="status">
                <LoaderCircle className="spin" />
                Cargando medicamentos y sucursales…
              </div>
            ) : !catalog ? (
              <section className="fc-load-error">
                <h1>No pudimos cargar los medicamentos</h1>
                <p>Comprueba tu conexión y vuelve a intentarlo.</p>
                <button className="pp-primary" onClick={load}>
                  Reintentar carga
                </button>
              </section>
            ) : (
              <>
                {step === 0 && (
                  <section className="fc-choose">
                    <h1>1. Elige tu sucursal</h1>
                    <p>Empieza por la farmacia o stand que te quede mejor.</p>
                    <div className="fc-filters">
                      <label className="fc-search">
                        <Search size={20} />
                        <input
                          aria-label="Buscar sucursal"
                          placeholder="Busca una sucursal o municipio"
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                        />
                      </label>
                      <label>
                        Departamento
                        <select value={department} onChange={(e) => setDepartment(e.target.value)}>
                          <option>Todos</option>
                          {[...new Set(catalog.branches.map((b) => b.department))]
                            .sort()
                            .map((d) => (
                              <option key={d}>{d}</option>
                            ))}
                        </select>
                      </label>
                    </div>
                    <div className="fc-branch-grid">
                      {catalog.branches
                        .filter(
                          (b) =>
                            (department === 'Todos' || b.department === department) &&
                            `${b.name} ${b.department} ${b.address}`
                              .toLocaleLowerCase()
                              .includes(query.toLocaleLowerCase()),
                        )
                        .map((b) => (
                          <article className="fc-branch-card" key={b.id}>
                            <div className="fc-branch-icon">
                              <Store size={24} />
                            </div>
                            <h2>{b.name}</h2>
                            <p>
                              <MapPin size={15} />
                              {b.department}
                            </p>
                            <p>{b.address}</p>
                            <small>
                              {b.type} · {b.opens_at}–{b.closes_at}
                            </small>
                            <button
                              className="pp-primary"
                              onClick={() => {
                                if (branch?.id !== b.id) {
                                  setCart([]);
                                  setPhoto('');
                                }
                                setBranch(b);
                                setQuery('');
                                invalidate();
                                move(1);
                              }}
                            >
                              Elegir {b.name}
                              <ArrowRight size={16} />
                            </button>
                          </article>
                        ))}
                    </div>
                    {!catalog.branches.length && (
                      <p>No hay sucursales disponibles por el momento.</p>
                    )}
                    <section className="fc-questions">
                      <div>
                        <span className="fc-kicker">TE ACOMPAÑAMOS</span>
                        <h2>¿Es tu primer pedido?</h2>
                        <p>Estas son las respuestas rápidas para empezar.</p>
                      </div>
                      <div>
                        <details>
                          <summary>¿Necesito crear una cuenta?</summary>
                          <p>
                            No. Al confirmar te pedimos nombre y celular para atender tu pedido.
                            Guarda tu ticket y código para consultarlo.
                          </p>
                        </details>
                        <details>
                          <summary>¿Cuándo puedo ir a recogerlo?</summary>
                          <p>
                            Cuando al consultar tu ticket aparezca “Listo para recoger”. Así puedes
                            pedir con anticipación y reducir el tiempo de espera en tienda.
                          </p>
                        </details>
                        <details>
                          <summary>¿Cómo pago y cuándo necesito receta?</summary>
                          <p>
                            Pagas en efectivo o con tarjeta al recibir. Si un medicamento necesita
                            receta, te pediremos una foto antes de confirmar y el personal la
                            revisará.
                          </p>
                        </details>
                      </div>
                    </section>
                  </section>
                )}
                {step === 1 && (
                  <>
                    <button className="pp-text fc-back" onClick={() => move(0)}>
                      <ArrowLeft size={17} />
                      Cambiar sucursal
                    </button>
                    <div className="fc-heading">
                      <h1>2. Agrega tus medicamentos</h1>
                      <p>
                        Tu sucursal es <strong>{branch.name}</strong>. Busca por nombre y agrega lo
                        que necesitas a tu bolsa.
                      </p>
                    </div>
                    <div className="fc-shopping">
                      <section>
                        <label className="fc-search">
                          <Search size={21} />
                          <input
                            aria-label="Buscar medicamento"
                            placeholder="Escribe el nombre del medicamento"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                          />
                        </label>
                        <p className="fc-subtle">
                          Escribe el nombre para ver los resultados. Puedes agregar varios
                          medicamentos.
                        </p>
                        {!query.trim() && (
                          <div className="fc-search-welcome">
                            <span className="fc-search-art" aria-hidden="true">
                              <Search size={33} />
                              <i>
                                <Pill size={18} />
                              </i>
                            </span>
                            <h2>¿Qué medicamento necesitas?</h2>
                            <p>
                              Escribe su nombre en el buscador de arriba.
                              <br />
                              Aquí aparecerán las opciones para tu pedido.
                            </p>
                            <span className="fc-search-tip">
                              <Sparkles size={15} />
                              Tu bolsa se va armando a tu ritmo
                            </span>
                          </div>
                        )}
                        <div className="fc-product-list">
                          {catalog.products
                            .filter(
                              (p) =>
                                query.trim() &&
                                `${p.name} ${p.component || ''}`
                                  .toLocaleLowerCase()
                                  .normalize('NFD')
                                  .replace(/[\u0300-\u036f]/g, '')
                                  .includes(
                                    query
                                      .trim()
                                      .toLocaleLowerCase()
                                      .normalize('NFD')
                                      .replace(/[\u0300-\u036f]/g, ''),
                                  ),
                            )
                            .map((p) => {
                              const n = cart.find((i) => i.id === p.id)?.quantity || 0,
                                available = stock(p);
                              return (
                                <article key={p.id} className="fc-product">
                                  <span className="fc-pill">
                                    <Pill size={22} />
                                  </span>
                                  <div className="fc-product-info">
                                    <h2>{p.name}</h2>
                                    <small>{p.component || 'Componente sin registrar'}</small>
                                    <div className="fc-product-tags">
                                      {Boolean(p.prescription) && <span>Requiere receta</span>}
                                      <small>
                                        {p.controlled
                                          ? 'Atención presencial'
                                          : available
                                            ? 'Disponible para pedir'
                                            : 'No disponible en esta sucursal'}
                                      </small>
                                    </div>
                                  </div>
                                  <div className="fc-product-buy">
                                    <strong>{money(p.price_cents)}</strong>
                                    <small>por unidad</small>
                                    {n > 0 ? (
                                      <>
                                        <QuantityPicker
                                          catalog
                                          name={p.name}
                                          value={n}
                                          max={100}
                                          onChange={(v) => quantity(p, v)}
                                        />
                                        <small>{money(n * p.price_cents)} en tu pedido</small>
                                      </>
                                    ) : (
                                      <button
                                        type="button"
                                        className="pp-secondary"
                                        aria-label={'Agregar ' + p.name}
                                        disabled={!available || Boolean(p.controlled) || n >= 100}
                                        onClick={() => quantity(p, n + 1)}
                                      >
                                        <Plus size={16} />
                                        Agregar
                                      </button>
                                    )}
                                  </div>
                                </article>
                              );
                            })}
                        </div>
                        {query.trim() &&
                          !catalog.products.some((p) =>
                            `${p.name} ${p.component || ''}`
                              .toLocaleLowerCase()
                              .normalize('NFD')
                              .replace(/[\u0300-\u036f]/g, '')
                              .includes(
                                query
                                  .trim()
                                  .toLocaleLowerCase()
                                  .normalize('NFD')
                                  .replace(/[\u0300-\u036f]/g, ''),
                              ),
                          ) && (
                            <div className="fc-search-welcome fc-search-noresults">
                              <Search size={28} />
                              <h2>No encontramos ese medicamento</h2>
                              <p>Revisa cómo se escribe o prueba con otro nombre.</p>
                            </div>
                          )}
                      </section>
                      {basket()}
                    </div>
                    <div className="fc-mobile-total">
                      <div>
                        <small>Total del pedido</small>
                        <strong>{money(total)}</strong>
                      </div>
                      <button
                        className="pp-primary"
                        disabled={!cart.length}
                        onClick={() => move(2)}
                      >
                        Continuar <ArrowRight size={17} />
                      </button>
                    </div>
                  </>
                )}
                {step === 2 && (
                  <>
                    <button className="pp-text fc-back" onClick={() => move(1)}>
                      <ArrowLeft size={17} />
                      Agregar o cambiar medicamentos
                    </button>
                    <h1>3. Confirma tu pedido</h1>
                    <p>
                      Completa tus datos. Te daremos un ticket para consultar y recibir tu pedido.
                    </p>
                    <div className="fc-shopping">
                      <form className="fc-checkout fc-form" onSubmit={submit}>
                        <fieldset>
                          <legend>¿Cómo lo recibirás?</legend>
                          <div className="fc-mode">
                            <label>
                              <input
                                type="radio"
                                name="mode"
                                checked={mode === 'pickup'}
                                onChange={() => {
                                  setMode('pickup');
                                  invalidate();
                                }}
                              />
                              Recoger en {branch.name}
                            </label>
                            <label>
                              <input
                                type="radio"
                                name="mode"
                                checked={mode === 'delivery'}
                                onChange={() => {
                                  setMode('delivery');
                                  invalidate();
                                }}
                              />
                              Recibir en casa
                            </label>
                          </div>
                          <p className="fc-subtle">
                            {mode === 'pickup'
                              ? 'Espera a que tu ticket diga “Listo para recoger”. La farmacia debe tener tu bolsa preparada.'
                              : 'La entrega depende de la cobertura de esta sucursal. El envío, si aplica, se coordina antes de despachar.'}
                          </p>
                        </fieldset>
                        <fieldset>
                          <legend>Tus datos de contacto</legend>
                          <label>
                            Nombre completo
                            <input
                              required
                              maxLength={100}
                              autoComplete="name"
                              value={details.customer}
                              onChange={(e) => update('customer', e.target.value)}
                            />
                          </label>
                          <div className="fc-form-row">
                            <label>
                              CUI / DPI · 13 dígitos (obligatorio)
                              <input
                                inputMode="numeric"
                                pattern="[0-9]{13}"
                                maxLength={13}
                                required
                                aria-invalid={
                                  Boolean(details.dpi) && !validGuatemalanCui(details.dpi)
                                }
                                value={details.dpi}
                                onChange={(e) => update('dpi', e.target.value.replace(/\D/g, ''))}
                              />
                            </label>
                            <label>
                              Número de celular
                              <input
                                required
                                type="tel"
                                autoComplete="tel"
                                pattern="[+0-9 ()\-]{8,25}"
                                maxLength={25}
                                value={details.phone}
                                onChange={(e) => update('phone', e.target.value)}
                              />
                            </label>
                          </div>
                          <small>
                            Debe tener dígito verificador y códigos válidos de departamento y
                            municipio.
                          </small>
                        </fieldset>
                        {mode === 'delivery' && (
                          <fieldset>
                            <legend>Dirección de entrega</legend>
                            <label>
                              Dirección de casa y referencias
                              <textarea
                                required
                                maxLength={250}
                                autoComplete="street-address"
                                value={details.address}
                                onChange={(e) => update('address', e.target.value)}
                              />
                            </label>
                            <button
                              type="button"
                              className="pp-secondary"
                              disabled={geoBusy}
                              onClick={locate}
                            >
                              <LocateFixed size={18} />
                              {geoBusy ? 'Buscando ubicación…' : 'Usar mi ubicación'}
                            </button>
                            <p>Toca el mapa para indicar el lugar exacto.</p>
                            <div className="fc-map">
                              <MapContainer
                                center={[branch.lat, branch.lng]}
                                zoom={12}
                                zoomAnimation={false}
                                fadeAnimation={false}
                                markerZoomAnimation={false}
                                style={{ height: '100%', width: '100%' }}
                              >
                                <MapTiles />
                                <LocationPin
                                  location={location}
                                  onChange={(p) => {
                                    setLocation(p);
                                    invalidate();
                                  }}
                                />
                              </MapContainer>
                            </div>
                            <small>
                              {location ? 'Ubicación marcada.' : 'Falta marcar tu ubicación.'}
                            </small>
                          </fieldset>
                        )}
                        {needsRx && (
                          <fieldset className="fc-rx">
                            <legend>Foto de la receta</legend>
                            <p>
                              La necesitamos únicamente por estos medicamentos:{' '}
                              <strong>
                                {cart
                                  .filter((i) => i.prescription)
                                  .map((i) => i.name)
                                  .join(', ')}
                              </strong>
                              .
                            </p>
                            <label>
                              Subir foto de receta
                              <input
                                type="file"
                                accept="image/jpeg,image/png,image/webp"
                                onChange={(e) => upload(e.target.files?.[0])}
                              />
                            </label>
                            <small>
                              Foto clara de la receta completa. JPG, PNG o WebP · máximo 2 MB. El
                              call center revisará la receta antes de la preparación.
                            </small>
                            {photo && (
                              <div className="fc-photo-preview">
                                <img src={photo} alt="Vista previa de tu receta" />
                                <span>{photoName}</span>
                                <button
                                  className="pp-text"
                                  type="button"
                                  onClick={() => {
                                    setPhoto('');
                                    setPhotoName('');
                                    invalidate();
                                  }}
                                >
                                  Quitar foto
                                </button>
                              </div>
                            )}
                          </fieldset>
                        )}
                        <fieldset>
                          <legend>¿Cómo pagarás al recibir?</legend>
                          <label>
                            Método de pago
                            <select
                              value={details.payment}
                              onChange={(e) => update('payment', e.target.value)}
                            >
                              <option>Efectivo</option>
                              <option>Tarjeta</option>
                            </select>
                          </label>
                          <p className="fc-subtle">
                            No pedimos números de tarjeta ni cobramos en línea.
                          </p>
                        </fieldset>
                        <label className="fc-consent">
                          <input type="checkbox" required />
                          Confirmo los datos y autorizo su uso para atender este pedido.
                        </label>
                        <div className="fc-confirm-total">
                          <span>Total a pagar al recibir</span>
                          <strong>{money(total)}</strong>
                        </div>
                        <button
                          className="pp-primary fc-wide"
                          disabled={busy || !cart.length || (needsRx && !photo)}
                        >
                          {busy ? (
                            <>
                              <LoaderCircle className="spin" size={18} />
                              Confirmando…
                            </>
                          ) : (
                            <>
                              Confirmar pedido y obtener ticket
                              <ArrowRight size={18} />
                            </>
                          )}
                        </button>
                        {error && (
                          <div className="pp-error" role="alert">
                            {error}
                          </div>
                        )}
                      </form>
                      {basket(true)}
                    </div>
                  </>
                )}
              </>
            )}
          </>
        )}
      </main>
      <footer className="fc-footer">
      </footer>
    </div>
  );
}
