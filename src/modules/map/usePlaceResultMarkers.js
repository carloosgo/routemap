import { useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import { useTranslation } from '../../i18n/index.jsx';
import { isPlaced } from '../trips/tripModel.js';
import { markerElement, resultMarkerScale, savePrompt } from './placeMapDom.js';

export function usePlaceResultMarkers({
  mapRef,
  mapReady,
  viewMode,
  results,
  places,
  addPlace,
  setSaveNotice,
}) {
  const { t } = useTranslation();
  const resultMarkersRef = useRef([]);
  const activePromptRef = useRef(null);
  const saveNoticeTimerRef = useRef(null);
  const addPlaceRef = useRef(addPlace);
  const placesRef = useRef(places);

  useEffect(() => {
    addPlaceRef.current = addPlace;
  }, [addPlace]);

  useEffect(() => {
    placesRef.current = places;
  }, [places]);

  useEffect(
    () => () => {
      clearTimeout(saveNoticeTimerRef.current);
    },
    []
  );

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return undefined;

    const syncResultMarkerScale = () => {
      const scale = String(resultMarkerScale(map.getZoom()));
      resultMarkersRef.current.forEach(({ button }) => {
        button?.style.setProperty('--place-marker-scale', scale);
      });
    };

    syncResultMarkerScale();
    map.on('zoom', syncResultMarkerScale);
    return () => map.off('zoom', syncResultMarkerScale);
  }, [mapReady, mapRef]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || viewMode !== 'places') return undefined;

    activePromptRef.current?.remove();
    activePromptRef.current = null;
    resultMarkersRef.current.forEach(({ marker }) => marker.remove());
    resultMarkersRef.current = [];

    const validResults = results.filter(isPlaced);
    const bounds = new maplibregl.LngLatBounds();

    function openPlace(place) {
      activePromptRef.current?.remove();
      map.easeTo({
        center: [place.lon, place.lat],
        zoom: Math.max(map.getZoom(), 15),
        duration: 350,
      });
      const alreadySaved = placesRef.current.some(
        (saved) => String(saved.id) === String(place.id)
      );
      let popup;
      popup = new maplibregl.Popup({
        anchor: 'bottom',
        offset: [0, -58],
        closeOnClick: false,
        closeButton: true,
        focusAfterOpen: false,
        className: 'place-save-popup',
      })
        .setMaxWidth('320px')
        .setLngLat([place.lon, place.lat])
        .setDOMContent(
          savePrompt(place, {
            alreadySaved,
            t,
            onSave: (selected) => {
              const savedPlace = {
                id: selected.id,
                name: selected.name || '',
                address: selected.address || selected.formatted || '',
                city: selected.city || '',
                country: selected.country || '',
                countryCode: selected.countryCode || '',
                category: selected.category || '',
                lat: Number(selected.lat),
                lon: Number(selected.lon),
                savedAt: new Date().toISOString(),
              };
              if (isPlaced(savedPlace)) {
                addPlaceRef.current?.(savedPlace);
                clearTimeout(saveNoticeTimerRef.current);
                setSaveNotice(t('placeSaved'));
                saveNoticeTimerRef.current = setTimeout(() => setSaveNotice(''), 2200);
              }
            },
            onClose: () => popup.remove(),
          })
        )
        .addTo(map);
      popup.on('close', () => {
        if (activePromptRef.current === popup) activePromptRef.current = null;
      });
      activePromptRef.current = popup;
    }

    validResults.forEach((place) => {
      const button = markerElement(place, t);
      button.style.setProperty('--place-marker-scale', String(resultMarkerScale(map.getZoom())));
      const marker = new maplibregl.Marker({ element: button, anchor: 'bottom' })
        .setLngLat([place.lon, place.lat])
        .addTo(map);

      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        openPlace(place);
      });

      resultMarkersRef.current.push({ marker, button });
      bounds.extend([place.lon, place.lat]);
    });

    if (validResults.length === 1) {
      map.easeTo({ center: [validResults[0].lon, validResults[0].lat], zoom: 14, duration: 350 });
    } else if (validResults.length > 1) {
      map.fitBounds(bounds, { padding: 140, maxZoom: 14, duration: 350 });
    }

    return () => {
      activePromptRef.current?.remove();
      activePromptRef.current = null;
      resultMarkersRef.current.forEach(({ marker }) => marker.remove());
      resultMarkersRef.current = [];
    };
  }, [mapReady, mapRef, results, setSaveNotice, t, viewMode]);
}
