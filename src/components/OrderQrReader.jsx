import React, { useEffect, useRef, useState } from 'react';
import { Camera, ImagePlus, Square } from 'lucide-react';
import jsQR from 'jsqr';

export default function OrderQrReader({ onRead, disabled }) {
  const [camera, setCamera] = useState(false),
    [error, setError] = useState(''),
    [reading, setReading] = useState(false);
  const video = useRef(null),
    stream = useRef(null),
    generation = useRef(0);
  function stop() {
    generation.current++;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    setCamera(false);
  }
  useEffect(
    () => () => {
      generation.current++;
      stream.current?.getTracks().forEach((t) => t.stop());
    },
    [],
  );
  useEffect(() => {
    if (disabled) stop();
  }, [disabled]);
  function decode(source, width, height) {
    const scale = Math.min(1, 1600 / Math.max(width, height)),
      canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return jsQR(pixels.data, pixels.width, pixels.height, { inversionAttempts: 'attemptBoth' });
  }
  async function start() {
    setError('');
    const version = ++generation.current;
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('La cámara no está disponible. Usa una foto del QR o escribe el código.');
      return;
    }
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
        audio: false,
      });
      if (generation.current !== version) {
        s.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = s;
      setCamera(true);
    } catch {
      setError('No se pudo abrir la cámara. Permite su uso o elige una imagen del QR.');
    }
  }
  useEffect(() => {
    if (!camera || !video.current) return;
    const element = video.current;
    element.srcObject = stream.current;
    element.play().catch(() => setError('No se pudo iniciar el video. Usa una foto del QR.'));
    let frame,
      previous = 0,
      active = true;
    function scan(time) {
      if (!active) return;
      if (time - previous > 300 && element.readyState >= 2) {
        previous = time;
        try {
          const qr = decode(element, element.videoWidth, element.videoHeight);
          if (qr) {
            stop();
            onRead(qr.data);
            return;
          }
        } catch {
          setError('No se pudo leer el video. Prueba con una imagen del QR.');
          stop();
          return;
        }
      }
      frame = requestAnimationFrame(scan);
    }
    frame = requestAnimationFrame(scan);
    return () => {
      active = false;
      cancelAnimationFrame(frame);
    };
  }, [camera, onRead]);
  async function file(event) {
    const selected = event.target.files?.[0];
    event.target.value = '';
    if (!selected) return;
    stop();
    setError('');
    setReading(true);
    try {
      if (
        !['image/png', 'image/jpeg', 'image/webp'].includes(selected.type) ||
        selected.size > 8 * 1024 * 1024
      )
        throw new Error('Elige una imagen JPG, PNG o WebP de máximo 8 MB.');
      const image = new Image();
      image.src = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(selected);
      });
      await image.decode();
      const qr = decode(image, image.naturalWidth, image.naturalHeight);
      if (!qr)
        throw new Error(
          'No encontramos un QR legible. Acerca o recorta la imagen, o escribe el código.',
        );
      onRead(qr.data);
    } catch (e) {
      setError(e.message || 'No se pudo leer esa imagen.');
    } finally {
      setReading(false);
    }
  }
  return (
    <div className="order-qr-reader">
      <div className="order-qr-options">
        <button
          type="button"
          className="secondary-button"
          disabled={disabled || reading}
          onClick={camera ? stop : start}
        >
          {camera ? <Square size={16} /> : <Camera size={16} />}
          {camera ? 'Detener cámara' : 'Usar cámara'}
        </button>
        <label className="secondary-button order-qr-upload">
          <ImagePlus size={16} />
          {reading ? 'Leyendo…' : 'Leer imagen del QR'}
          <input
            aria-label="Imagen del QR del pedido"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            disabled={disabled || reading}
            onChange={file}
          />
        </label>
      </div>
      {camera && (
        <div className="order-camera">
          <video ref={video} autoPlay muted playsInline />
          <p>Enfoca el QR del ticket del cliente.</p>
        </div>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
