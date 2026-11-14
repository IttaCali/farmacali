import React, { useEffect, useState } from 'react';
import { TileLayer, useMap } from 'react-leaflet';
export default function MapTiles() {
  const map = useMap(),
    [failed, setFailed] = useState(false),
    [loaded, setLoaded] = useState(false),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const container = map.getContainer();
    let frame;
    let center = map.getCenter(),
      zoom = map.getZoom(),
      resizing = false;
    const remember = () => {
      if (!resizing) {
        center = map.getCenter();
        zoom = map.getZoom();
      }
    };
    const resize = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        resizing = true;
        map.invalidateSize({ pan: true, debounceMoveend: true });
        map.setView(center, zoom, { animate: false });
        resizing = false;
      });
    };
    map.on('moveend', remember);
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    resize();
    window.addEventListener('orientationchange', resize);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      map.off('moveend', remember);
      window.removeEventListener('orientationchange', resize);
    };
  }, [map]);
  return (
    <>
      <TileLayer
        key={attempt}
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
        subdomains="abcd"
        maxZoom={20}
        eventHandlers={{ tileerror: () => setFailed(true), tileload: () => setLoaded(true) }}
      />
      {failed && !loaded && (
        <div className="map-load-note" role="status">
          No se cargó el mapa de calles. Revisa tu conexión. Las ubicaciones marcadas siguen
          disponibles.
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setFailed(false);
              setAttempt(attempt + 1);
              map.invalidateSize();
            }}
          >
            Reintentar mapa
          </button>
        </div>
      )}
    </>
  );
}
