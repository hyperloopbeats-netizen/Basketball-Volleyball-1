import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  APIProvider,
  AdvancedMarker,
  InfoWindow,
  Map as GoogleMap,
  MapCameraChangedEvent,
  Pin,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import {
  Car,
  Compass,
  Download,
  ExternalLink,
  Layers,
  Loader2,
  MapPin,
  Printer,
  RefreshCw,
  TrainFront,
  X,
} from 'lucide-react';

export interface DiscoveredPlace {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  primaryType: string;
  typeLabel: string;
  rating?: number;
  mapsUri?: string;
}

type MapTypeOption = 'roadmap' | 'hybrid' | 'satellite' | 'terrain';

interface AreaPreset {
  id: string;
  label: string;
  center: { lat: number; lng: number };
  zoom: number;
}

const VANCOUVER_AREA_PRESETS: AreaPreset[] = [
  {
    id: 'stadium',
    label: 'Stadium & Parking',
    center: { lat: 49.2804, lng: -123.1119 },
    zoom: 16,
  },
  {
    id: 'harbour',
    label: 'Coal Harbour',
    center: { lat: 49.2889, lng: -123.1165 },
    zoom: 15,
  },
  {
    id: 'downtown',
    label: 'Downtown Grid',
    center: { lat: 49.2827, lng: -123.1207 },
    zoom: 15,
  },
];

const PLACE_PIN_STYLE: Record<
  string,
  { background: string; glyphColor: string; borderColor: string; shortCode: string }
> = {
  parking: {
    background: '#f59e0b',
    glyphColor: '#090612',
    borderColor: '#fef3c7',
    shortCode: 'P',
  },
  transit_station: {
    background: '#06b6d4',
    glyphColor: '#090612',
    borderColor: '#cffafe',
    shortCode: 'T',
  },
  stadium: {
    background: '#ff3d7f',
    glyphColor: '#ffffff',
    borderColor: '#fbcfe8',
    shortCode: 'S',
  },
  park: {
    background: '#10b981',
    glyphColor: '#090612',
    borderColor: '#d1fae5',
    shortCode: 'G',
  },
  tourist_attraction: {
    background: '#ff6b1a',
    glyphColor: '#090612',
    borderColor: '#ffedd5',
    shortCode: 'L',
  },
};

function getPinStyle(primaryType: string) {
  return (
    PLACE_PIN_STYLE[primaryType] || {
      background: '#38bdf8',
      glyphColor: '#090612',
      borderColor: '#e0f2fe',
      shortCode: 'M',
    }
  );
}

function getStaticMarkerColor(primaryType: string): string {
  switch (primaryType) {
    case 'parking':
      return 'orange';
    case 'transit_station':
      return 'blue';
    case 'stadium':
      return 'red';
    case 'park':
      return 'green';
    default:
      return 'purple';
  }
}

function isQuotaErrorLike(err: unknown): boolean {
  if (!err) return false;
  const txt =
    err instanceof Error
      ? `${err.name} ${err.message}`
      : typeof err === 'string'
      ? err
      : JSON.stringify(err);
  return (
    txt.includes('RESOURCE_EXHAUSTED') ||
    txt.includes('OVER_QUERY_LIMIT') ||
    txt.includes('OverQuotaMapError') ||
    txt.includes('QuotaExceededError') ||
    txt.includes('429')
  );
}

function dispatchQuotaExceeded() {
  window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
}

function TrafficLayerController({ enabled }: { enabled: boolean }) {
  const map = useMap();
  const mapsLib = useMapsLibrary('maps');
  const layerRef = useRef<google.maps.TrafficLayer | null>(null);

  useEffect(() => {
    if (!map || !mapsLib) return;
    if (enabled) {
      if (!layerRef.current) {
        layerRef.current = new mapsLib.TrafficLayer();
      }
      layerRef.current.setMap(map);
    } else if (layerRef.current) {
      layerRef.current.setMap(null);
    }
    return () => {
      if (layerRef.current) {
        layerRef.current.setMap(null);
      }
    };
  }, [map, mapsLib, enabled]);

  return null;
}

function NearbyPlacesScanner({
  center,
  scanNonce,
  onResults,
  onLoadingChange,
  onError,
}: {
  center: { lat: number; lng: number };
  scanNonce: number;
  onResults: (places: DiscoveredPlace[]) => void;
  onLoadingChange: (loading: boolean) => void;
  onError: (msg: string | null) => void;
}) {
  const placesLib = useMapsLibrary('places');

  useEffect(() => {
    let cancelled = false;

    async function runScan() {
      onLoadingChange(true);
      onError(null);

      try {
        if (placesLib?.Place?.searchNearby) {
          const request: google.maps.places.SearchNearbyRequest = {
            fields: [
              'id',
              'displayName',
              'formattedAddress',
              'location',
              'primaryType',
              'primaryTypeDisplayName',
              'rating',
              'googleMapsURI',
            ],
            locationRestriction: {
              center,
              radius: 1450,
            },
            includedTypes: [
              'stadium',
              'parking',
              'transit_station',
              'tourist_attraction',
              'park',
            ],
            maxResultCount: 12,
          };

          const { places } = await placesLib.Place.searchNearby(request);
          if (cancelled) return;

          const mapped: DiscoveredPlace[] = (places || [])
            .filter((p) => p.location)
            .map((p) => ({
              id: p.id || `${p.location!.lat()}-${p.location!.lng()}`,
              name: p.displayName || 'Vancouver Place',
              address: p.formattedAddress || 'Vancouver, BC',
              lat: p.location!.lat(),
              lng: p.location!.lng(),
              primaryType: p.primaryType || 'tourist_attraction',
              typeLabel: p.primaryTypeDisplayName || p.primaryType || 'Landmark',
              rating: typeof p.rating === 'number' ? p.rating : undefined,
              mapsUri: p.googleMapsURI || undefined,
            }));

          onResults(mapped);
          onLoadingChange(false);
          return;
        }
      } catch (err) {
        if (isQuotaErrorLike(err)) {
          dispatchQuotaExceeded();
          if (!cancelled) {
            onError('Maps service temporarily rate-limited.');
            onLoadingChange(false);
          }
          return;
        }
      }

      // Server proxy fallback using Places API (New) REST
      try {
        const resp = await fetch('/api/maps/places-nearby', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            lat: center.lat,
            lng: center.lng,
            radius: 1450,
            includedTypes: [
              'stadium',
              'parking',
              'transit_station',
              'tourist_attraction',
              'park',
            ],
            maxResultCount: 12,
          }),
        });

        if (resp.status === 429) {
          dispatchQuotaExceeded();
          if (!cancelled) {
            onError('Maps service temporarily rate-limited.');
            onLoadingChange(false);
          }
          return;
        }

        const payload = await resp.json().catch(() => ({}));
        if (payload?.error?.status === 'RESOURCE_EXHAUSTED') {
          dispatchQuotaExceeded();
        }
        if (!resp.ok) {
          if (!cancelled) {
            onError(payload?.error?.message || payload?.error || 'Could not fetch nearby places.');
            onLoadingChange(false);
          }
          return;
        }

        if (cancelled) return;
        const rawList = Array.isArray(payload.places) ? payload.places : [];
        const mapped: DiscoveredPlace[] = rawList
          .filter((p: { location?: { latitude?: number; longitude?: number } }) =>
            typeof p?.location?.latitude === 'number' && typeof p?.location?.longitude === 'number'
          )
          .map(
            (p: {
              id?: string;
              displayName?: { text?: string };
              formattedAddress?: string;
              location: { latitude: number; longitude: number };
              primaryType?: string;
              primaryTypeDisplayName?: { text?: string };
              rating?: number;
              googleMapsUri?: string;
            }) => ({
              id: p.id || `${p.location.latitude}-${p.location.longitude}`,
              name: p.displayName?.text || 'Vancouver Place',
              address: p.formattedAddress || 'Vancouver, BC',
              lat: p.location.latitude,
              lng: p.location.longitude,
              primaryType: p.primaryType || 'tourist_attraction',
              typeLabel: p.primaryTypeDisplayName?.text || p.primaryType || 'Landmark',
              rating: typeof p.rating === 'number' ? p.rating : undefined,
              mapsUri: p.googleMapsUri || undefined,
            })
          );

        onResults(mapped);
      } catch {
        if (!cancelled) {
          onError('Unable to reach Places lookup.');
        }
      } finally {
        if (!cancelled) onLoadingChange(false);
      }
    }

    void runScan();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placesLib, scanNonce]);

  return null;
}

export interface VancouverMapPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const VancouverMapPrintModal: React.FC<VancouverMapPrintModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [apiKey, setApiKey] = useState<string>(() => {
    const metaEnv = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
    const viteKey = metaEnv?.VITE_GOOGLE_MAPS_API_KEY || '';
    const globalKey =
      (globalThis as unknown as { GOOGLE_MAPS_API_KEY?: string }).GOOGLE_MAPS_API_KEY || '';
    return viteKey || globalKey || '';
  });
  const [keyLoading, setKeyLoading] = useState<boolean>(!apiKey);

  const [cameraCenter, setCameraCenter] = useState<{ lat: number; lng: number }>(
    VANCOUVER_AREA_PRESETS[0].center
  );
  const [cameraZoom, setCameraZoom] = useState<number>(VANCOUVER_AREA_PRESETS[0].zoom);
  const [mapType, setMapType] = useState<MapTypeOption>('hybrid');
  const [showTraffic, setShowTraffic] = useState<boolean>(true);
  const [scanNonce, setScanNonce] = useState<number>(0);

  const [places, setPlaces] = useState<DiscoveredPlace[]>([]);
  const [placesLoading, setPlacesLoading] = useState<boolean>(false);
  const [placesError, setPlacesError] = useState<string | null>(null);
  const [selectedPlace, setSelectedPlace] = useState<DiscoveredPlace | null>(null);
  const markerRefs = useRef<Record<string, google.maps.marker.AdvancedMarkerElement | null>>({});

  const [staticImageUrl, setStaticImageUrl] = useState<string | null>(null);
  const [staticImageLoading, setStaticImageLoading] = useState<boolean>(false);
  const [staticImageError, setStaticImageError] = useState<string | null>(null);
  const staticBlobUrlRef = useRef<string | null>(null);

  // Resolve key from server endpoint if not statically inlined in client bundle
  useEffect(() => {
    if (!isOpen || apiKey) {
      setKeyLoading(false);
      return;
    }
    let cancelled = false;
    setKeyLoading(true);
    fetch('/api/maps/config')
      .then((r) => r.json())
      .then((data: { configured?: boolean; apiKey?: string }) => {
        if (cancelled) return;
        if (data?.apiKey) setApiKey(data.apiKey);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setKeyLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, apiKey]);

  const staticProxyUrl = useMemo(() => {
    const params = new URLSearchParams({
      center: `${cameraCenter.lat.toFixed(5)},${cameraCenter.lng.toFixed(5)}`,
      zoom: String(Math.round(cameraZoom)),
      size: '640x380',
      scale: '2',
      maptype: mapType,
    });
    const topPlaces = places.slice(0, 9);
    topPlaces.forEach((p, idx) => {
      const color = getStaticMarkerColor(p.primaryType);
      params.append('markers', `color:${color}|label:${idx + 1}|${p.lat.toFixed(5)},${p.lng.toFixed(5)}`);
    });
    return `/api/maps/static-image?${params.toString()}`;
  }, [cameraCenter.lat, cameraCenter.lng, cameraZoom, mapType, places]);

  const refreshStaticPrintImage = useCallback(async () => {
    if (!isOpen) return;
    setStaticImageLoading(true);
    setStaticImageError(null);
    try {
      const resp = await fetch(staticProxyUrl);
      if (resp.status === 429) {
        dispatchQuotaExceeded();
        setStaticImageError('Map print image temporarily unavailable due to rate limit.');
        return;
      }
      if (!resp.ok) {
        const errPayload = await resp.json().catch(() => ({}));
        setStaticImageError(errPayload?.error || 'Unable to generate printable map image.');
        return;
      }
      const blob = await resp.blob();
      const objUrl = URL.createObjectURL(blob);
      if (staticBlobUrlRef.current) {
        URL.revokeObjectURL(staticBlobUrlRef.current);
      }
      staticBlobUrlRef.current = objUrl;
      setStaticImageUrl(objUrl);
    } catch {
      setStaticImageError('Failed to render printable static map preview.');
    } finally {
      setStaticImageLoading(false);
    }
  }, [isOpen, staticProxyUrl]);

  useEffect(() => {
    if (!isOpen || !apiKey) return;
    const timer = window.setTimeout(() => {
      void refreshStaticPrintImage();
    }, 350);
    return () => window.clearTimeout(timer);
  }, [isOpen, apiKey, refreshStaticPrintImage]);

  useEffect(() => {
    return () => {
      if (staticBlobUrlRef.current) {
        URL.revokeObjectURL(staticBlobUrlRef.current);
        staticBlobUrlRef.current = null;
      }
    };
  }, []);

  const handleCameraChanged = useCallback((ev: MapCameraChangedEvent) => {
    const c = ev.detail.center;
    const z = ev.detail.zoom;
    if (c && Number.isFinite(c.lat) && Number.isFinite(c.lng)) {
      setCameraCenter({ lat: c.lat, lng: c.lng });
    }
    if (Number.isFinite(z)) {
      setCameraZoom(z);
    }
  }, []);

  const handleSelectPreset = (preset: AreaPreset) => {
    setCameraCenter(preset.center);
    setCameraZoom(preset.zoom);
    setSelectedPlace(null);
    setScanNonce((n) => n + 1);
  };

  const handlePrintArea = () => {
    window.print();
  };

  const handleDownloadPng = () => {
    if (!staticImageUrl) return;
    const a = document.createElement('a');
    a.href = staticImageUrl;
    a.download = `aim-vancouver-area-z${Math.round(cameraZoom)}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  if (!isOpen) return null;

  return (
    <div className="vancouver-print-modal-backdrop fixed inset-0 z-50 bg-[#05030b]/92 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="w-full max-w-6xl bg-[#0d081a] border border-[#00f0ff]/40 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[95vh]">
        {/* Interactive Modal Top Bar (Hidden when Printing) */}
        <div className="no-print px-4 py-3 bg-[#120b24] border-b border-white/10 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#00f0ff]/15 border border-[#00f0ff]/40 flex items-center justify-center text-[#00f0ff]">
              <MapPin className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-vice text-lg tracking-wider text-white leading-none">
                VANCOUVER DISTRICT MAP &amp; AREA PRINT
              </h2>
              <p className="font-mono text-[10px] text-slate-400 mt-0.5">
                Live Google Maps · Traffic Flow · Nearby Parking, Transit &amp; Landmarks
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={() => setScanNonce((n) => n + 1)}
              disabled={placesLoading || !apiKey}
              className="px-2.5 py-1.5 rounded-lg bg-[#160d2c] border border-[#00f0ff]/40 text-[#00f0ff] hover:bg-[#00f0ff] hover:text-[#090612] disabled:opacity-40 font-mono text-[10px] font-bold uppercase flex items-center gap-1.5"
            >
              {placesLoading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" />
              )}
              <span>SCAN AREA</span>
            </button>

            <button
              onClick={handleDownloadPng}
              disabled={!staticImageUrl}
              className="px-2.5 py-1.5 rounded-lg bg-[#160d2c] border border-[#ffb347]/50 text-[#ffb347] hover:bg-[#ffb347] hover:text-[#090612] disabled:opacity-40 font-mono text-[10px] font-bold uppercase flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              <span>SAVE PNG</span>
            </button>

            <button
              onClick={handlePrintArea}
              className="px-3 py-1.5 rounded-lg bg-[#00f0ff] hover:bg-[#3bf4ff] text-[#090612] font-mono text-[10px] font-black uppercase flex items-center gap-1.5"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>PRINT AREA</span>
            </button>

            <button
              aria-label="Close Map & Print Studio"
              onClick={onClose}
              className="w-8 h-8 rounded-lg bg-[#1a1030] border border-white/15 text-slate-300 hover:text-white flex items-center justify-center"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Interactive Toolbar Row (Hidden when Printing) */}
        <div className="no-print px-4 py-2 bg-[#090612] border-b border-white/10 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex flex-wrap items-center gap-1">
            <Compass className="w-3.5 h-3.5 text-[#ff6b1a] mr-1" />
            {VANCOUVER_AREA_PRESETS.map((preset) => (
              <button
                key={preset.id}
                onClick={() => handleSelectPreset(preset)}
                className="px-2.5 py-1 rounded-md bg-[#140b26] hover:border-[#00f0ff] border border-white/15 text-slate-200 font-mono text-[10px] font-bold"
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <div className="flex items-center gap-1">
              <Layers className="w-3.5 h-3.5 text-slate-400 mr-0.5" />
              {(['roadmap', 'hybrid', 'satellite', 'terrain'] as MapTypeOption[]).map((mt) => (
                <button
                  key={mt}
                  onClick={() => setMapType(mt)}
                  className={`px-2 py-1 rounded text-[10px] font-mono font-bold uppercase border ${
                    mapType === mt
                      ? 'bg-[#ff3d7f] text-white border-[#ff3d7f]'
                      : 'bg-[#140b26] text-slate-300 border-white/10'
                  }`}
                >
                  {mt}
                </button>
              ))}
            </div>

            <button
              onClick={() => setShowTraffic((v) => !v)}
              className={`px-2.5 py-1 rounded text-[10px] font-mono font-bold uppercase border flex items-center gap-1 ${
                showTraffic
                  ? 'bg-emerald-400 text-[#090612] border-emerald-200'
                  : 'bg-[#140b26] text-slate-300 border-white/10'
              }`}
            >
              <Car className="w-3 h-3" />
              <span>TRAFFIC</span>
            </button>
          </div>
        </div>

        {/* Scrollable Workspace: Live Interactive Map + Printable Area Sheet */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-4">
          {keyLoading ? (
            <div className="no-print h-[360px] rounded-xl bg-[#120b24] border border-white/10 flex flex-col items-center justify-center gap-2 text-slate-300">
              <Loader2 className="w-6 h-6 animate-spin text-[#00f0ff]" />
              <span className="font-mono text-xs">Loading Google Maps configuration...</span>
            </div>
          ) : !apiKey ? (
            <div className="no-print rounded-xl bg-[#120b24] border border-amber-400/40 p-6 text-center space-y-2">
              <div className="font-mono text-xs font-bold text-amber-300 uppercase">
                Google Maps API Key Not Found
              </div>
              <p className="text-xs text-slate-300 max-w-md mx-auto">
                Configure VITE_GOOGLE_MAPS_API_KEY or GOOGLE_MAPS_API_KEY in your environment and restart the server to load the interactive Vancouver district map and print sheet.
              </p>
            </div>
          ) : (
            <>
              {/* Live Interactive Google Map + Real Places Sidebar (Hidden when Printing) */}
              <div className="no-print grid grid-cols-1 lg:grid-cols-3 gap-3">
                <div className="lg:col-span-2 rounded-xl overflow-hidden border border-[#00f0ff]/35 bg-[#090612] h-[360px] sm:h-[420px] relative">
                  <APIProvider
                    apiKey={apiKey}
                    libraries={['places', 'maps', 'marker']}
                    language="en"
                    region="CA"
                    internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
                  >
                    <GoogleMap
                      mapId="DEMO_MAP_ID"
                      center={cameraCenter}
                      zoom={cameraZoom}
                      mapTypeId={mapType}
                      onCameraChanged={handleCameraChanged}
                      gestureHandling="greedy"
                      mapTypeControl={false}
                      streetViewControl={true}
                      fullscreenControl={false}
                      internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
                      className="w-full h-full"
                    >
                      <TrafficLayerController enabled={showTraffic} />
                      <NearbyPlacesScanner
                        center={cameraCenter}
                        scanNonce={scanNonce}
                        onResults={setPlaces}
                        onLoadingChange={setPlacesLoading}
                        onError={setPlacesError}
                      />

                      {places.map((p, index) => {
                        const style = getPinStyle(p.primaryType);
                        return (
                          <AdvancedMarker
                            key={p.id}
                            position={{ lat: p.lat, lng: p.lng }}
                            title={p.name}
                            ref={(el) => {
                              markerRefs.current[p.id] = el;
                            }}
                            onClick={() => setSelectedPlace(p)}
                          >
                            <Pin
                              background={style.background}
                              glyphColor={style.glyphColor}
                              borderColor={style.borderColor}
                              glyphText={String(index + 1)}
                            />
                          </AdvancedMarker>
                        );
                      })}

                      {selectedPlace && (
                        <InfoWindow
                          anchor={markerRefs.current[selectedPlace.id] || undefined}
                          position={
                            markerRefs.current[selectedPlace.id]
                              ? undefined
                              : { lat: selectedPlace.lat, lng: selectedPlace.lng }
                          }
                          onCloseClick={() => setSelectedPlace(null)}
                        >
                          <div className="text-slate-900 p-1 max-w-[220px] space-y-1">
                            <div className="font-bold text-xs leading-tight">{selectedPlace.name}</div>
                            <div className="text-[10px] font-semibold text-sky-700 uppercase">
                              {selectedPlace.typeLabel}
                              {selectedPlace.rating ? ` · ★ ${selectedPlace.rating.toFixed(1)}` : ''}
                            </div>
                            <div className="text-[11px] text-slate-600">{selectedPlace.address}</div>
                            {selectedPlace.mapsUri && (
                              <a
                                href={selectedPlace.mapsUri}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-[10px] font-bold text-cyan-700 underline"
                              >
                                <span>Open in Google Maps</span>
                                <ExternalLink className="w-2.5 h-2.5" />
                              </a>
                            )}
                          </div>
                        </InfoWindow>
                      )}
                    </GoogleMap>
                  </APIProvider>
                </div>

                {/* Live Places Discovery List */}
                <div className="rounded-xl bg-[#120b24] border border-white/10 p-3 flex flex-col h-[360px] sm:h-[420px]">
                  <div className="flex items-center justify-between border-b border-white/10 pb-2 mb-2">
                    <div className="flex items-center gap-1.5">
                      <TrainFront className="w-3.5 h-3.5 text-[#00f0ff]" />
                      <span className="font-mono text-[10px] font-extrabold text-white uppercase">
                        REAL NEARBY PLACES ({places.length})
                      </span>
                    </div>
                    <span className="font-mono text-[9px] text-slate-400">
                      {cameraCenter.lat.toFixed(4)}, {cameraCenter.lng.toFixed(4)}
                    </span>
                  </div>

                  {placesError && (
                    <div className="mb-2 px-2.5 py-1.5 rounded bg-amber-950/60 border border-amber-400/40 font-mono text-[10px] text-amber-200">
                      {placesError}
                    </div>
                  )}

                  <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
                    {placesLoading && places.length === 0 ? (
                      <div className="h-full flex items-center justify-center text-slate-400 font-mono text-xs gap-2">
                        <Loader2 className="w-4 h-4 animate-spin text-[#00f0ff]" />
                        <span>Querying Google Places...</span>
                      </div>
                    ) : places.length === 0 ? (
                      <div className="h-full flex items-center justify-center text-center text-slate-400 font-mono text-[11px] px-3">
                        Pan or select a Vancouver preset and click SCAN AREA to list nearby venues, parking, transit, and landmarks.
                      </div>
                    ) : (
                      places.map((p, idx) => {
                        const pinStyle = getPinStyle(p.primaryType);
                        const isSelected = selectedPlace?.id === p.id;
                        return (
                          <button
                            key={p.id}
                            onClick={() => {
                              setSelectedPlace(p);
                              setCameraCenter({ lat: p.lat, lng: p.lng });
                            }}
                            className={`w-full text-left p-2 rounded-lg border transition-colors ${
                              isSelected
                                ? 'bg-[#1c1138] border-[#00f0ff]'
                                : 'bg-[#090612] border-white/10 hover:border-white/25'
                            }`}
                          >
                            <div className="flex items-start gap-2">
                              <span
                                className="w-5 h-5 rounded-full text-[10px] font-mono font-black flex items-center justify-center shrink-0 mt-0.5"
                                style={{
                                  backgroundColor: pinStyle.background,
                                  color: pinStyle.glyphColor,
                                }}
                              >
                                {idx + 1}
                              </span>
                              <div className="min-w-0 flex-1">
                                <div className="text-xs font-bold text-white truncate">{p.name}</div>
                                <div className="font-mono text-[9px] text-[#00f0ff] uppercase flex items-center gap-1.5">
                                  <span>{p.typeLabel}</span>
                                  {p.rating && <span className="text-[#ffb347]">★ {p.rating.toFixed(1)}</span>}
                                </div>
                                <div className="text-[10px] text-slate-400 truncate mt-0.5">
                                  {p.address}
                                </div>
                              </div>
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>

              {/* ========================================================= */}
              {/* PRINT-READY VANCOUVER AREA SHEET (MAPS STATIC API + INDEX) */}
              {/* ========================================================= */}
              <div
                id="vancouver-print-sheet"
                className="bg-white text-slate-900 rounded-xl border border-slate-300 p-4 sm:p-5 space-y-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-200 pb-3">
                  <div>
                    <div className="font-mono text-[10px] font-bold uppercase tracking-wider text-sky-700">
                      AIM VANCOUVER STADIUM · DISTRICT AREA SHEET
                    </div>
                    <h3 className="text-lg font-extrabold text-slate-900">
                      Downtown Vancouver, Stadium Parking &amp; Waterfront Map
                    </h3>
                  </div>
                  <div className="font-mono text-[10px] text-slate-600 text-right tabular-nums">
                    <div>
                      CENTER {cameraCenter.lat.toFixed(5)}, {cameraCenter.lng.toFixed(5)} · Z
                      {Math.round(cameraZoom)}
                    </div>
                    <div className="uppercase">
                      VIEW: {mapType} · {places.length} VERIFIED PLACES
                    </div>
                  </div>
                </div>

                {/* High-Resolution Static Map Print Image */}
                <div className="rounded-lg overflow-hidden border border-slate-300 bg-slate-100 min-h-[240px] flex items-center justify-center relative">
                  {staticImageLoading && (
                    <div className="no-print absolute top-2 right-2 bg-slate-900/85 text-white px-2.5 py-1 rounded-md font-mono text-[10px] flex items-center gap-1.5">
                      <Loader2 className="w-3 h-3 animate-spin text-[#00f0ff]" />
                      <span>Rendering print map...</span>
                    </div>
                  )}
                  {staticImageUrl ? (
                    <img
                      src={staticImageUrl}
                      alt="Printable Google Map of Vancouver Stadium District"
                      className="w-full h-auto max-h-[420px] object-contain"
                    />
                  ) : (
                    <div className="p-6 text-center font-mono text-xs text-slate-500">
                      {staticImageError || 'Generating high-resolution printable area map...'}
                    </div>
                  )}
                </div>

                {/* Verified Places Directory Table for Print */}
                {places.length > 0 && (
                  <div>
                    <div className="font-mono text-[10px] font-bold uppercase text-slate-500 mb-2">
                      District Landmarks, Parking &amp; Transit Directory (Markers #1–#{Math.min(9, places.length)} on Map)
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                      {places.map((p, idx) => (
                        <div
                          key={`print-${p.id}`}
                          className="border border-slate-200 rounded-lg px-2.5 py-2 text-xs bg-slate-50"
                        >
                          <div className="flex items-center justify-between gap-1 font-bold text-slate-900">
                            <span className="truncate">
                              #{idx + 1} {p.name}
                            </span>
                            {p.rating && (
                              <span className="font-mono text-[10px] text-amber-600 shrink-0">
                                ★ {p.rating.toFixed(1)}
                              </span>
                            )}
                          </div>
                          <div className="font-mono text-[9px] text-sky-700 uppercase">
                            {p.typeLabel}
                          </div>
                          <div className="text-[11px] text-slate-600 truncate">{p.address}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
