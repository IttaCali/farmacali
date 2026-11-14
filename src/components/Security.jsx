import BrandMark from './BrandMark.jsx';
import React, { useState, useEffect, useRef } from 'react';
import {
  ShieldCheck,
  Smartphone,
  Plus,
  Trash2,
  Truck,
  Building2,
  LockKeyhole,
  LoaderCircle,
  LogOut,
  UserRound,
  KeyRound,
  ChevronDown,
  Clock,
  Pill,
} from 'lucide-react';
import { api } from '../lib/api';
import { Modal, RecordForm, Badge } from './ui';
export function SecureLogin({ onLogin }) {
  const [email, setEmail] = useState(''),
    [password, setPassword] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [demo, setDemo] = useState(false),
    [challenge, setChallenge] = useState(null),
    [code, setCode] = useState(''),
    [newPassword, setNewPassword] = useState(''),
    [recovery, setRecovery] = useState(false),
    [issued, setIssued] = useState(null);
  useEffect(() => {
    api('/health')
      .then((r) => setDemo(r.demo))
      .catch(() => setError('No se pudo conectar con el servidor.'));
  }, []);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await api(
        challenge ? '/auth/complete' : '/auth/login',
        challenge
          ? {
              challenge: challenge.challenge,
              ...(challenge.step === 'password'
                ? { new_password: newPassword }
                : recovery && challenge.step === 'totp'
                  ? { recovery_code: code }
                  : { code }),
            }
          : { email, password },
      );
      if (result.step) {
        setChallenge(result);
        setCode('');
        setRecovery(false);
      } else if (result.recovery_codes) setIssued(result);
      else onLogin(result.user);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const demos = [
    ['Administrador', 'admin@farmacia.gt', 'Farmacia2026!'],
    ['Sucursal', 'sucursal@farmacia.gt', 'Sucursal2026!'],
    ['Call center', 'callcenter@farmacia.gt', 'Operador2026!'],
    ['Auditor', 'auditor@farmacia.gt', 'Auditor2026!'],
    ['Repartidor', 'repartidor@farmacia.gt', 'Repartidor2026!'],
  ];
  if (issued)
    return (
      <div className="recovery-page">
        <section className="recovery-sheet">
          <RecoveryCodes codes={issued.recovery_codes} onDone={() => onLogin(issued.user)} />
        </section>
      </div>
    );
  return (
    <div className="login-page">
      <div className="login-story">
        <div className="brand">
          <span className="brand-mark">
            <BrandMark />
          </span>
          <div>
            Farma<span>Cali</span>
            <small>GESTIÓN DE FARMACIAS</small>
          </div>
        </div>
        <div className="login-copy">
          <span className="eyebrow">FARMACIAS Y STANDS CONECTADOS</span>
          <h1>El trabajo de cada sucursal, en orden.</h1>
          <p>
            Inventario, finanzas y entregas conectadas. Cuatro roles, operaciones trazables y acceso
            por sucursal.
          </p>
          <div className="login-network">
            <div>
              <Building2 size={24} />
              <strong>Sucursal y call center</strong>
              <span>Permisos distintos para cada operación</span>
            </div>
            <div>
              <ShieldCheck size={24} />
              <strong>Auditoría verificable</strong>
              <span>Historial protegido y cadena de hashes</span>
            </div>
            <div>
              <Truck size={24} />
              <strong>Entregas coordinadas</strong>
              <span>Stock, carga de pedidos y horarios</span>
            </div>
          </div>
        </div>
        <span className="login-foot">FarmaCali · Plataforma de gestión farmacéutica</span>
      </div>
      <div className="login-side">
        <div className="login-form">
          <span className="small-label">CENTRO DE OPERACIONES</span>
          <h2>
            {challenge
              ? challenge.step === 'enroll'
                ? 'Configura tu segundo factor'
                : challenge.step === 'password'
                  ? 'Cambia tu clave temporal'
                  : 'Verifica tu identidad'
              : 'Bienvenido a FarmaCali'}
          </h2>
          <p>
            {challenge
              ? 'Completa este paso para iniciar una sesión protegida.'
              : 'Ingresa con el rol asignado a tu cuenta.'}
          </p>
          <form onSubmit={submit}>
            {!challenge ? (
              <>
                <label>
                  Correo electrónico
                  <input
                    aria-label="Correo electrónico"
                    type="email"
                    autoComplete="username"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </label>
                <label>
                  Contraseña
                  <input
                    aria-label="Contraseña"
                    type="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </label>
              </>
            ) : challenge.step === 'password' ? (
              <label>
                Contraseña nueva
                <input
                  aria-label="Contraseña nueva"
                  type="password"
                  autoComplete="new-password"
                  minLength={10}
                  maxLength={128}
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
                <small>Mínimo 10 caracteres, mayúscula, número y símbolo.</small>
              </label>
            ) : (
              <>
                {challenge.step === 'enroll' && (
                  <div className="totp-setup">
                    <p>
                      {challenge.instructions} Usa Microsoft Authenticator para escanear el código
                      QR y generar códigos de verificación.
                    </p>
                    <img src={challenge.qr} alt="QR para configurar el segundo factor" />
                    <details>
                      <summary>Configurar manualmente</summary>
                      <code>{challenge.secret}</code>
                    </details>
                  </div>
                )}
                <label>
                  {recovery ? 'Código de recuperación' : 'Código de autenticación'}
                  <input
                    aria-label={recovery ? 'Código de recuperación' : 'Código de autenticación'}
                    inputMode={recovery ? 'text' : 'numeric'}
                    autoComplete="one-time-code"
                    pattern={recovery ? '[A-Fa-f0-9 -]{16,24}' : '[0-9]{6}'}
                    maxLength={recovery ? 24 : 6}
                    required
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                  />
                </label>
                {challenge.step === 'totp' && (
                  <div className="recovery-help">
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => {
                        setRecovery(!recovery);
                        setCode('');
                        setError('');
                      }}
                    >
                      {recovery
                        ? 'Usar mi aplicación autenticadora'
                        : 'Perdí mi dispositivo: usar código de recuperación'}
                    </button>
                    {recovery && (
                      <p>
                        Escribe uno de los códigos que guardaste al activar la seguridad. Cada
                        código sirve una sola vez. Si no conservas ninguno, solicita a la
                        administración la verificación de tu identidad.
                      </p>
                    )}
                  </div>
                )}
              </>
            )}
            {error && (
              <div className="form-error" role="alert">
                {error}
              </div>
            )}
            <button disabled={busy} className="primary-button">
              {busy ? <LoaderCircle className="spin" size={17} /> : <LockKeyhole size={17} />}{' '}
              {busy ? 'Validando…' : challenge ? 'Continuar' : 'Iniciar sesión'}
            </button>
            {challenge && (
              <button
                type="button"
                className="link-button"
                onClick={() => {
                  setChallenge(null);
                  setError('');
                }}
              >
                Volver al inicio
              </button>
            )}
          </form>
          <div className="login-security">
            <ShieldCheck size={15} />
            Acceso del personal · Tus permisos dependen de tu cuenta
          </div>
        </div>
      </div>
    </div>
  );
}
export function AccountMenu({ user, onLogout }) {
  const anchor = useRef(null);
  const [open, setOpen] = useState(false),
    [mfaEnabled, setMfaEnabled] = useState(!!user.totp_enabled),
    [modal, setModal] = useState(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    const outside = (e) => {
      if (!anchor.current?.contains(e.target)) setOpen(false);
    };
    const escape = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);
  async function change(v) {
    setBusy(true);
    setError('');
    try {
      await api('/auth/password', v);
      await onLogout();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="account-anchor" ref={anchor}>
      <button
        aria-label="Abrir menú de usuario"
        aria-expanded={open}
        className="account-button"
        onClick={() => setOpen(!open)}
      >
        <span className="avatar small">{user.name[0]}</span>
        <ChevronDown size={13} />
      </button>
      {open && (
        <div className="account-menu">
          <strong>{user.name}</strong>
          <span>
            {user.role_name}
            {user.role === 'auditor' ? ' · solo lectura' : ''}
          </span>
          {user.branch_name && <span>{user.branch_name}</span>}
          <button
            onClick={() => {
              setOpen(false);
              setModal('profile');
            }}
          >
            <UserRound size={16} />
            Mi perfil
          </button>
          <button
            onClick={() => {
              setOpen(false);
              setModal('password');
            }}
          >
            <KeyRound size={16} />
            Cambiar contraseña
          </button>
          <button
            onClick={() => {
              setOpen(false);
              setModal('security');
            }}
          >
            <ShieldCheck size={16} />
            Seguridad
          </button>
          <button onClick={onLogout}>
            <LogOut size={16} />
            Cerrar sesión
          </button>
        </div>
      )}
      {modal === 'security' && (
        <SecuritySettings onClose={() => setModal(null)} onStatus={setMfaEnabled} />
      )}
      {modal && modal !== 'security' && (
        <Modal
          title={modal === 'profile' ? 'Mi perfil' : 'Cambiar contraseña'}
          onClose={() => setModal(null)}
        >
          {modal === 'profile' ? (
            <div className="detail-grid">
              <span>Nombre</span>
              <strong>{user.name}</strong>
              <span>Correo</span>
              <strong>{user.email}</strong>
              <span>Rol</span>
              <strong>{user.role_name}</strong>
              <span>Sucursal</span>
              <strong>{user.branch_name || 'Oficina central'}</strong>
              <span>Segundo factor</span>
              <strong>{mfaEnabled ? 'Activado' : 'Sin aplicación vinculada'}</strong>
            </div>
          ) : (
            <>
              {error && <div className="form-error">{error}</div>}
              <RecordForm
                busy={busy}
                submit="Actualizar y cerrar sesiones"
                onSubmit={change}
                fields={[
                  {
                    name: 'current_password',
                    label: 'Contraseña actual',
                    type: 'password',
                    wide: true,
                  },
                  { name: 'new_password', label: 'Contraseña nueva', type: 'password', wide: true },
                ]}
              />
            </>
          )}
        </Modal>
      )}
    </div>
  );
}
function RecoveryCodes({ codes, onDone }) {
  const [saved, setSaved] = useState(false);
  function download() {
    const url = URL.createObjectURL(
      new Blob(
        [
          'FarmaCali - Códigos de recuperación\n\nCada código se puede usar una sola vez.\nGuárdalos fuera del teléfono y no los compartas.\n\n' +
            codes.join('\n'),
        ],
        { type: 'text/plain;charset=utf-8' },
      ),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = 'farmacali-codigos-recuperacion.txt';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <div className="recovery-codes">
      <ShieldCheck size={28} />
      <h2>Guarda tus códigos de recuperación</h2>
      <p>
        Se muestran una sola vez. Si pierdes tu teléfono, podrás entrar con tu contraseña y uno de
        estos códigos. Guarda una copia en un lugar seguro, fuera del dispositivo.
      </p>
      <div className="recovery-code-grid">
        {codes.map((code) => (
          <code key={code}>{code}</code>
        ))}
      </div>
      <button className="secondary-button" onClick={download}>
        Descargar códigos
      </button>
      <label className="security-check">
        <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
        Ya guardé mis códigos en un lugar seguro.
      </label>
      <button className="primary-button" disabled={!saved} onClick={onDone}>
        Ya guardé mis códigos
      </button>
    </div>
  );
}
function SecuritySettings({ onClose, onStatus }) {
  const [status, setStatus] = useState(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [action, setAction] = useState('setup'),
    [editing, setEditing] = useState(false),
    [password, setPassword] = useState(''),
    [proof, setProof] = useState(''),
    [useRecovery, setUseRecovery] = useState(false),
    [setup, setSetup] = useState(null),
    [code, setCode] = useState(''),
    [codes, setCodes] = useState(null),
    [message, setMessage] = useState('');
  async function load() {
    try {
      const state = await api('/auth/security');
      setStatus(state);
      onStatus(state.enabled);
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => {
    load();
  }, []);
  function begin(nextAction) {
    setAction(nextAction);
    setEditing(true);
    setPassword('');
    setProof('');
    setCode('');
    setUseRecovery(false);
    setSetup(null);
    setError('');
    setMessage('');
  }
  function cancel() {
    setEditing(false);
    setSetup(null);
    setPassword('');
    setProof('');
    setCode('');
    setUseRecovery(false);
    setError('');
  }
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = setup
        ? await api('/auth/security/confirm', { challenge: setup.challenge, code })
        : await api('/auth/security', {
            action,
            current_password: password,
            ...(status.enabled ? (useRecovery ? { recovery_code: proof } : { code: proof }) : {}),
          });
      setPassword('');
      setProof('');
      setCode('');
      if (result.challenge) setSetup(result);
      else {
        setSetup(null);
        setCodes(result.recovery_codes || null);
        setEditing(false);
        setAction('setup');
        setMessage(result.message || 'Códigos renovados. Los anteriores ya no sirven.');
        await load();
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Información de seguridad"
      subtitle="Administra los métodos para iniciar sesión en tu cuenta."
      onClose={onClose}
    >
      {codes ? (
        <RecoveryCodes codes={codes} onDone={() => setCodes(null)} />
      ) : (
        <div className="security-settings">
          {error && (
            <div className="form-error" role="alert">
              {error}
            </div>
          )}
          {message && (
            <p className="security-success" role="status">
              {message}
            </p>
          )}
          {!status ? (
            <button className="secondary-button" onClick={load}>
              Cargar configuración
            </button>
          ) : (
            <>
              {!editing && (
                <>
                  <div className="security-status">
                    <ShieldCheck size={25} />
                    <div>
                      <strong>
                        {status.enabled
                          ? 'Autenticación en dos pasos activada'
                          : 'Protege tu cuenta con Microsoft Authenticator'}
                      </strong>
                      <p>
                        {status.required
                          ? 'Tu rol requiere un segundo factor para iniciar sesión.'
                          : 'Agrega un segundo factor para proteger tu inicio de sesión.'}
                      </p>
                    </div>
                  </div>
                  <section className="security-methods" aria-labelledby="security-methods-title">
                    <h3 id="security-methods-title">Métodos de inicio de sesión</h3>
                    <div className="security-method">
                      <KeyRound size={22} aria-hidden="true" />
                      <div>
                        <strong>Contraseña</strong>
                        <small>Método principal de inicio de sesión</small>
                      </div>
                      <span className="security-method-state">Activa</span>
                    </div>
                    <div className="security-method">
                      <span className="microsoft-authenticator-mark" aria-hidden="true">
                        M
                      </span>
                      <div>
                        <strong>Microsoft Authenticator</strong>
                        <small>
                          {status.enabled
                            ? 'Códigos de un solo uso · 2FA activado'
                            : 'Usa códigos de seis dígitos'}
                        </small>
                      </div>
                      {status.enabled ? (
                        <button
                          type="button"
                          className="security-text-button"
                          onClick={() => begin('setup')}
                        >
                          Cambiar
                        </button>
                      ) : (
                        <span className="security-method-state">No agregado</span>
                      )}
                      {status.enabled && !status.required && (
                        <button
                          type="button"
                          className="security-text-button security-remove-button"
                          aria-label="Quitar Microsoft Authenticator"
                          title="Quitar Microsoft Authenticator"
                          onClick={() => begin('disable')}
                        >
                          <Trash2 size={17} />
                          Quitar
                        </button>
                      )}
                    </div>
                    {!status.enabled && (
                      <button
                        type="button"
                        className="security-add-method"
                        onClick={() => begin('setup')}
                      >
                        <Plus size={19} />
                        Agregar método de inicio de sesión
                      </button>
                    )}
                  </section>
                  <p className="security-authenticator-note">
                    Configura Microsoft Authenticator para generar códigos de verificación de seis
                    dígitos. Este método usa códigos temporales; no envía notificaciones push ni
                    permite iniciar sesión con huella o rostro.
                  </p>
                  {status.enabled && (
                    <section className="security-recovery">
                      <div>
                        <strong>Códigos de recuperación</strong>
                        <small>
                          {status.recovery_remaining} códigos de recuperación disponibles
                        </small>
                      </div>
                      {!status.recovery_remaining && (
                        <p className="security-warning">
                          No tienes códigos disponibles. Genera un juego nuevo y guárdalo fuera de
                          tu teléfono.
                        </p>
                      )}
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => begin('codes')}
                      >
                        Generar nuevos códigos
                      </button>
                    </section>
                  )}
                  {message && (
                    <p className="security-success" role="status">
                      {message}
                    </p>
                  )}
                </>
              )}
              {editing && (
                <form onSubmit={submit} className="security-form">
                  <button type="button" className="link-button" onClick={cancel} disabled={busy}>
                    ← Volver a información de seguridad
                  </button>
                  {setup ? (
                    <>
                      <h3>
                        {status.enabled
                          ? 'Cambiar Microsoft Authenticator'
                          : 'Agregar Microsoft Authenticator'}
                      </h3>
                      <p>
                        Abre Microsoft Authenticator, pulsa “+”, elige “Otra cuenta” y escanea este
                        código QR.
                      </p>
                      <div className="totp-setup">
                        <img
                          src={setup.qr}
                          alt="QR para vincular la nueva aplicación autenticadora"
                        />
                        <details>
                          <summary>Configurar manualmente</summary>
                          <code>{setup.secret}</code>
                        </details>
                      </div>
                      <p className="security-setup-note">
                        La aplicación actual seguirá activa hasta que confirmes el nuevo código. El
                        código QR vence en cinco minutos.
                      </p>
                      <label>
                        Código de Microsoft Authenticator
                        <input
                          aria-label="Código de Microsoft Authenticator"
                          value={code}
                          onChange={(e) => setCode(e.target.value)}
                          inputMode="numeric"
                          autoComplete="one-time-code"
                          pattern="[0-9]{6}"
                          maxLength={6}
                          required
                        />
                      </label>
                      <button className="primary-button" disabled={busy}>
                        Confirmar Microsoft Authenticator
                      </button>
                      <button
                        type="button"
                        className="link-button"
                        disabled={busy}
                        onClick={cancel}
                      >
                        Cancelar configuración
                      </button>
                    </>
                  ) : (
                    <>
                      <h3>
                        {action === 'setup'
                          ? status.enabled
                            ? 'Cambiar Microsoft Authenticator'
                            : 'Agregar Microsoft Authenticator'
                          : action === 'disable'
                            ? 'Quitar Microsoft Authenticator'
                            : 'Generar códigos de recuperación'}
                      </h3>
                      {action === 'setup' && (
                        <p>
                          {status.enabled
                            ? 'Confirma tu identidad y registra la nueva aplicación. La anterior seguirá activa hasta completar el cambio.'
                            : 'Confirma tu identidad para registrar Microsoft Authenticator.'}
                        </p>
                      )}
                      {action === 'codes' && (
                        <p className="security-warning">
                          Se invalidarán todos los códigos de recuperación anteriores.
                        </p>
                      )}
                      {action === 'disable' && (
                        <p className="security-warning">
                          Al quitar la aplicación se invalidarán todos sus códigos de recuperación.
                        </p>
                      )}
                      <label>
                        Contraseña actual
                        <input
                          aria-label="Contraseña actual"
                          type="password"
                          autoComplete="current-password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          required
                        />
                      </label>
                      {status.enabled && (
                        <>
                          <label>
                            {useRecovery
                              ? 'Código de recuperación'
                              : 'Código de Microsoft Authenticator'}
                            <input
                              aria-label={
                                useRecovery
                                  ? 'Código de recuperación'
                                  : 'Código de Microsoft Authenticator'
                              }
                              value={proof}
                              onChange={(e) => setProof(e.target.value)}
                              inputMode={useRecovery ? 'text' : 'numeric'}
                              autoComplete="one-time-code"
                              pattern={useRecovery ? '[A-Fa-f0-9 -]{16,24}' : '[0-9]{6}'}
                              maxLength={useRecovery ? 24 : 6}
                              required
                            />
                          </label>
                          <button
                            type="button"
                            className="link-button"
                            onClick={() => {
                              setUseRecovery(!useRecovery);
                              setProof('');
                            }}
                          >
                            {useRecovery
                              ? 'Usar Microsoft Authenticator'
                              : 'No tengo el dispositivo: usar un código de recuperación'}
                          </button>
                          <small>
                            Si acabas de usar un código de la app, espera al siguiente. Cada código
                            solo se admite una vez.
                          </small>
                        </>
                      )}
                      <button className="primary-button" disabled={busy}>
                        {busy
                          ? 'Verificando…'
                          : action === 'disable'
                            ? 'Quitar Microsoft Authenticator'
                            : action === 'codes'
                              ? 'Generar códigos'
                              : 'Continuar con seguridad'}
                      </button>
                    </>
                  )}
                </form>
              )}
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
export function useInactivity(user, onLogout) {
  const [seconds, setSeconds] = useState(900);
  useEffect(() => {
    if (!user) return;
    let last = Date.now(),
      lastPing = 0;
    const activity = () => {
      last = Date.now();
      setSeconds(900);
      if (last - lastPing > 60000) {
        lastPing = last;
        api('/auth/activity', {}).catch(() => {});
      }
    };
    const timer = setInterval(() => {
      const remain = Math.max(0, 900 - Math.floor((Date.now() - last) / 1000));
      setSeconds(remain);
      if (remain === 0) onLogout();
    }, 1000);
    const events = ['pointerdown', 'keydown', 'scroll'];
    events.forEach((e) => window.addEventListener(e, activity, { passive: true }));
    return () => {
      clearInterval(timer);
      events.forEach((e) => window.removeEventListener(e, activity));
    };
  }, [user, onLogout]);
  return user && seconds <= 60 ? (
    <div className="idle-warning" role="alert">
      <Clock size={17} />
      Tu sesión terminará por inactividad en {seconds} segundos. Interactúa con el sistema para
      continuar.
    </div>
  ) : null;
}
