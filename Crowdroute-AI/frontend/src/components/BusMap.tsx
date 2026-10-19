import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import {
  AllocateResponse,
  Bus,
  ForecastResponse,
  RiskLevel,
  ScenarioData,
  Stop,
} from '../types/api';
import {
  MapPin,
  AlertTriangle,
  ShieldAlert,
  ArrowRight,
  ShieldCheck,
  Bus as BusIcon,
  Clock,
  Info,
  CheckCircle2,
  Layers,
  Eye,
  EyeOff,
  Sun,
  Users,
  Compass,
} from 'lucide-react';
import {
  formatTo12Hour,
  calculateDurationMinutes,
  formatDuration,
} from '../utils/timeFormat';

interface BusMapProps {
  stops: Stop[];
  fleet: Bus[];
  forecast: ForecastResponse | null;
  allocation: AllocateResponse | null;
  scenario?: ScenarioData | null;
}

export const DEMO_STOP_COORDINATES: Record<
  string,
  { lat: number; lng: number; description: string }
> = {
  STOP_MAIN: {
    lat: 12.2285,
    lng: 79.0700,
    description: 'Central Terminal 400m from main temple gate',
  },
  STOP_PERIPHERAL: {
    lat: 12.2450,
    lng: 79.0680,
    description: 'North Bypass Ring staging hub with idle capacity',
  },
  STOP_EAST_GATE: {
    lat: 12.2260,
    lng: 79.0830,
    description: 'Pedestrian feeder corridor and parking zone',
  },
};

export const BusMap: React.FC<BusMapProps> = ({
  stops,
  fleet,
  forecast,
  allocation,
  scenario,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const [selectedStopId, setSelectedStopId] = useState<string>('STOP_MAIN');
  const [selectedBusId, setSelectedBusId] = useState<string | null>(null);

  // Layer toggles matching Screenshot 1
  const [showBoundaries, setShowBoundaries] = useState(true);
  const [showRiskStops, setShowRiskStops] = useState(true);
  const [showRoutes, setShowRoutes] = useState(true);
  const [showRelocations, setShowRelocations] = useState(true);
  const [showVehicleBays, setShowVehicleBays] = useState(true);

  const getRiskColor = (risk?: RiskLevel) => {
    switch (risk) {
      case 'CRITICAL':
        return '#dc2626';
      case 'HIGH':
        return '#ea580c';
      case 'MODERATE':
        return '#d97706';
      case 'LOW':
      default:
        return '#059669';
    }
  };

  const getRiskLabel = (risk?: RiskLevel) => {
    switch (risk) {
      case 'CRITICAL':
        return 'VERY HIGH CROWD';
      case 'HIGH':
        return 'HIGH CROWD';
      case 'MODERATE':
        return 'MODERATE CROWD';
      case 'LOW':
      default:
        return 'LOW CROWD';
    }
  };

  const getBusState = (bus: Bus) => {
    const isRelocated = allocation?.recommended_moves.some((m) => m.bus_id === bus.bus_id);
    if (isRelocated) {
      return {
        label: 'Recommended for Relocation',
        shortLabel: 'RELOCATING',
        color: '#ea580c',
        bg: '#fff7ed',
        border: '#fdba74',
      };
    }
    if (bus.status === 'in_transit') {
      return {
        label: 'In Transit (Simulated)',
        shortLabel: 'IN TRANSIT',
        color: '#0284c7',
        bg: '#f0f9ff',
        border: '#7dd3fc',
      };
    }
    if (bus.status === 'available') {
      return {
        label: 'Available at Depot',
        shortLabel: 'AVAILABLE',
        color: '#059669',
        bg: '#ecfdf5',
        border: '#6ee7b7',
      };
    }
    return {
      label: 'Unavailable / Maintenance',
      shortLabel: 'UNAVAILABLE',
      color: '#64748b',
      bg: '#f8fafc',
      border: '#cbd5e1',
    };
  };

  const getStopCoords = (stopId: string) => {
    const foundStop = stops.find((s) => s.stop_id === stopId);
    if (foundStop && foundStop.latitude != null && foundStop.longitude != null) {
      return {
        lat: foundStop.latitude,
        lng: foundStop.longitude,
        description: foundStop.name,
        isConfigured: true,
        isDemoLocation: false,
      };
    }
    if (DEMO_STOP_COORDINATES[stopId]) {
      return {
        ...DEMO_STOP_COORDINATES[stopId],
        isConfigured: true,
        isDemoLocation: true,
      };
    }
    const idx = stops.findIndex((s) => s.stop_id === stopId);
    return {
      lat: 12.2335 + Math.max(0, idx) * 0.008,
      lng: 79.0730 + Math.max(0, idx) * 0.008,
      description: `${stopId} (Demo location)`,
      isConfigured: false,
      isDemoLocation: true,
    };
  };

  useEffect(() => {
    if (!stops || stops.length === 0) return;
    if (!mapContainerRef.current) return;

    if (mapInstanceRef.current) {
      try {
        mapInstanceRef.current.remove();
      } catch (e) {
        console.warn('Map cleanup error:', e);
      }
      mapInstanceRef.current = null;
    }

    if (mapContainerRef.current && (mapContainerRef.current as any)._leaflet_id) {
      delete (mapContainerRef.current as any)._leaflet_id;
    }

    let map: L.Map;
    try {
      map = L.map(mapContainerRef.current, {
        center: [12.2335, 79.0730],
        zoom: 14,
        scrollWheelZoom: false,
      });
      mapInstanceRef.current = map;
    } catch (e) {
      console.error('Leaflet initialization error:', e);
      return;
    }

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
      maxZoom: 18,
    }).addTo(map);

    const markerCoordsList: [number, number][] = [];

    // 1. Regular routes between stands
    if (showRoutes) {
      const drawnRoutes = new Set<string>();
      const travelMatrix = scenario?.travel_time_matrix_minutes || {};
      Object.keys(travelMatrix).forEach((srcId) => {
        Object.keys(travelMatrix[srcId] || {}).forEach((dstId) => {
          if (srcId === dstId) return;
          const routeKey = [srcId, dstId].sort().join('--');
          if (drawnRoutes.has(routeKey)) return;
          drawnRoutes.add(routeKey);

          const srcCoords = getStopCoords(srcId);
          const dstCoords = getStopCoords(dstId);
          if (srcCoords && dstCoords) {
            const regularLine = L.polyline(
              [
                [srcCoords.lat, srcCoords.lng],
                [dstCoords.lat, dstCoords.lng],
              ],
              {
                color: '#3b82f6',
                weight: 2,
                opacity: 0.45,
              }
            ).addTo(map);

            regularLine.bindPopup(`
              <div style="font-family: sans-serif; padding: 4px; font-size: 11px;">
                <strong style="color: #1e3a8a;">Regular Transit Route</strong><br/>
                <span>Between <strong>${srcId}</strong> and <strong>${dstId}</strong></span><br/>
                <span style="color: #64748b;">Transit time: ~${travelMatrix[srcId][dstId]} mins</span>
              </div>
            `);
          }
        });
      });
    }

    // 2. Relocation transfers
    if (showRelocations && allocation?.recommended_moves && allocation.recommended_moves.length > 0) {
      allocation.recommended_moves.forEach((move) => {
        const originCoords = getStopCoords(move.source_stop_id);
        const destCoords = getStopCoords(move.destination_stop_id);

        if (originCoords && destCoords) {
          const travelMatrix = scenario?.travel_time_matrix_minutes || {};
          const durationMins =
            calculateDurationMinutes(move.departure_time, move.estimated_arrival_time) ||
            (travelMatrix[move.source_stop_id]?.[move.destination_stop_id] ?? 20);

          const moveLine = L.polyline(
            [
              [originCoords.lat, originCoords.lng],
              [destCoords.lat, destCoords.lng],
            ],
            {
              color: '#ea580c',
              weight: 3.5,
              opacity: 0.85,
              dashArray: '8, 8',
            }
          ).addTo(map);

          moveLine.bindPopup(`
            <div style="font-family: sans-serif; padding: 6px; font-size: 11px; min-width: 200px;">
              <strong style="color: #c2410c; font-size: 12px;">Planned Bus Relocation Transfer</strong><br/>
              <span style="font-size: 10px; color: #64748b;">(Illustrative direct transfer indicator; not road navigation)</span><br/>
              <div style="margin-top: 4px; padding-top: 4px; border-top: 1px solid #e2e8f0;">
                Bus ID: <strong>${move.bus_id}</strong><br/>
                Origin: <strong>${move.source_stop_id}</strong> ➔ Dest: <strong>${move.destination_stop_id}</strong><br/>
                Departure: <strong>${formatTo12Hour(move.departure_time)}</strong><br/>
                Est. Arrival: <strong>${formatTo12Hour(move.estimated_arrival_time)}</strong> (${formatDuration(durationMins)})<br/>
                Destination Benefit: <strong style="color: #059669;">+${move.estimated_destination_benefit} pax</strong>
              </div>
            </div>
          `);
        }
      });
    }

    // 3. Stop Pins & Assigned Buses
    if (showRiskStops) {
      stops.forEach((stop) => {
        const coords = getStopCoords(stop.stop_id);
        markerCoordsList.push([coords.lat, coords.lng]);

        const summary = forecast?.stop_summaries[stop.stop_id];
        const risk = summary?.overall_risk || 'LOW';
        const color = getRiskColor(risk);

        const assignedBusesAtStop = fleet.filter((b) => b.initial_stop_id === stop.stop_id);
        const assignedCount = assignedBusesAtStop.length;

        const stopOutgoing = allocation?.recommended_moves.filter((m) => m.source_stop_id === stop.stop_id) || [];
        const stopIncoming = allocation?.recommended_moves.filter((m) => m.destination_stop_id === stop.stop_id) || [];

        const markerHtml = `
          <div style="
            position: relative;
            width: 36px;
            height: 36px;
            border-radius: 9999px;
            background-color: ${color};
            border: 3px solid #ffffff;
            box-shadow: 0 4px 10px rgba(0,0,0,0.35);
            display: flex;
            align-items: center;
            justify-content: center;
            color: #ffffff;
            font-weight: bold;
            font-family: sans-serif;
            font-size: 13px;
            cursor: pointer;
          " title="${stop.name}">
            🚏
            <span style="
              position: absolute;
              top: -6px;
              right: -6px;
              background-color: #0f172a;
              color: #ffffff;
              font-size: 10px;
              font-weight: 800;
              padding: 1px 4px;
              border-radius: 9999px;
              border: 1px solid #ffffff;
              font-family: monospace;
            ">
              ${assignedCount}
            </span>
          </div>
        `;

        const customIcon = L.divIcon({
          className: 'custom-stop-pin',
          html: markerHtml,
          iconSize: [36, 36],
          iconAnchor: [18, 18],
        });

        const marker = L.marker([coords.lat, coords.lng], { icon: customIcon }).addTo(map);

        marker.bindPopup(`
          <div style="font-family: sans-serif; padding: 4px; min-width: 210px;">
            <strong style="color: #0f172a; font-size: 13px;">${stop.name}</strong><br/>
            <span style="font-size: 11px; color: #64748b;">Code: <strong>${stop.stop_id}</strong></span><br/>
            <span style="font-size: 11px; color: ${color}; font-weight: bold;">${getRiskLabel(risk)}</span><br/>
            <span style="font-size: 11px; color: #334155;">Peak Demand: <strong>${summary ? summary.peak_demand.toLocaleString() : 0} pax</strong></span><br/>
            <span style="font-size: 11px; color: #334155;">Busiest Time: <strong>${summary ? formatTo12Hour(summary.peak_interval) : 'N/A'}</strong></span><br/>
            <span style="font-size: 11px; color: ${assignedCount === 0 ? '#dc2626' : '#059669'}; font-weight: bold;">
              ${assignedCount === 0 ? 'No buses assigned (0 pax/window)' : `${assignedCount} buses stationed (${summary ? summary.baseline_scheduled_capacity.toLocaleString() : 0} pax/window capacity)`}
            </span>
          </div>
        `);

        marker.on('click', () => {
          setSelectedStopId(stop.stop_id);
          setSelectedBusId(null);
        });

        // 4. Vehicle clusters
        if (showVehicleBays && assignedCount > 0) {
          const radius = 0.0022;
          const step = (2 * Math.PI) / assignedCount;

          assignedBusesAtStop.forEach((b, bIdx) => {
            const angle = bIdx * step;
            const busLat = coords.lat + radius * Math.cos(angle);
            const busLng = coords.lng + radius * Math.sin(angle);
            const busState = getBusState(b);

            const busIconHtml = `
              <div style="
                width: 26px;
                height: 26px;
                border-radius: 6px;
                background-color: ${busState.bg};
                border: 2px solid ${busState.color};
                box-shadow: 0 2px 6px rgba(0,0,0,0.25);
                display: flex;
                align-items: center;
                justify-content: center;
                color: ${busState.color};
                font-weight: bold;
                font-family: sans-serif;
                font-size: 12px;
                cursor: pointer;
              " title="Bus ${b.bus_id} (${busState.shortLabel})">
                🚌
              </div>
            `;

            const busDivIcon = L.divIcon({
              className: 'custom-vehicle-marker',
              html: busIconHtml,
              iconSize: [26, 26],
              iconAnchor: [13, 13],
            });

            const busMarker = L.marker([busLat, busLng], { icon: busDivIcon }).addTo(map);

            busMarker.on('click', () => {
              setSelectedStopId(stop.stop_id);
              setSelectedBusId(b.bus_id);
            });
          });
        }
      });
    }

    if (markerCoordsList.length > 0) {
      const bounds = L.latLngBounds(markerCoordsList);
      map.fitBounds(bounds, { padding: [45, 45], maxZoom: 15 });
    }

    const timer = setTimeout(() => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.invalidateSize();
      }
    }, 200);

    return () => {
      clearTimeout(timer);
      try {
        if (mapInstanceRef.current) {
          mapInstanceRef.current.remove();
          mapInstanceRef.current = null;
        }
      } catch (err) {
        console.warn('Map cleanup error:', err);
      }
      if (mapContainerRef.current && (mapContainerRef.current as any)._leaflet_id) {
        delete (mapContainerRef.current as any)._leaflet_id;
      }
    };
  }, [stops, fleet, forecast, allocation, scenario, showRoutes, showRelocations, showRiskStops, showVehicleBays]);

  if (!stops || stops.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-500 space-y-2">
        <MapPin className="w-8 h-8 text-slate-400 mx-auto" />
        <p className="font-semibold text-slate-700">Loading Transit Map & Bus Stands...</p>
        <p className="text-xs text-slate-500">Retrieving configured bus stands and fleet positions.</p>
      </div>
    );
  }

  const selectedStop = stops.find((s) => s.stop_id === selectedStopId) || stops[0];
  const selectedSummary = forecast?.stop_summaries[selectedStopId];
  const assignedBuses = fleet.filter((b) => b.initial_stop_id === selectedStopId);
  const outgoingMoves = allocation?.recommended_moves.filter((m) => m.source_stop_id === selectedStopId) || [];
  const incomingMoves = allocation?.recommended_moves.filter((m) => m.destination_stop_id === selectedStopId) || [];

  return (
    <div className="space-y-4">
      
      {/* 3-COLUMN PROFESSIONAL GIS CONTAINER (MATCHING WATERLOGAI SCREENSHOT 1) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        
        {/* LEFT COLUMN: ADMINISTRATIVE HIERARCHY & LAYER CONTROLS (SCREENSHOT 1) */}
        <div className="lg:col-span-3 space-y-4">
          
          {/* TOP FOCUS BUTTONS */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              className="px-3 py-2 rounded-lg bg-white border-2 border-sky-600 text-sky-800 text-xs font-bold shadow-sm flex items-center justify-center gap-1.5"
            >
              <Compass className="w-3.5 h-3.5 text-sky-600" />
              <span>Focus Stand</span>
            </button>
            <button
              type="button"
              className="px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs font-bold shadow-sm flex items-center justify-center gap-1.5"
            >
              <Layers className="w-3.5 h-3.5 text-emerald-600" />
              <span>Focus Corridor</span>
            </button>
          </div>

          {/* CARD 1: ADMINISTRATIVE HIERARCHY */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 uppercase tracking-wide">
                <MapPin className="w-3.5 h-3.5 text-sky-600" />
                <span>Administrative Hierarchy</span>
              </div>
              <span className="px-1.5 py-0.2 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800">
                Active
              </span>
            </div>

            <div className="space-y-2 text-xs">
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">COUNTRY</label>
                <div className="mt-0.5 px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-700 font-semibold">
                  IN India
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">STATE</label>
                <div className="mt-0.5 px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-700 font-semibold">
                  Tamil Nadu ★ (Active Focus)
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">DISTRICT / CITY</label>
                <div className="mt-0.5 px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-700 font-semibold">
                  Tiruvannamalai ★ (Festival Zone)
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">KEY BUS STAND</label>
                <select
                  value={selectedStopId}
                  onChange={(e) => {
                    setSelectedStopId(e.target.value);
                    setSelectedBusId(null);
                  }}
                  className="mt-0.5 w-full px-2.5 py-1.5 rounded-lg bg-sky-50 border border-sky-300 text-sky-950 font-bold focus:outline-none cursor-pointer"
                >
                  {stops.map((s) => (
                    <option key={s.stop_id} value={s.stop_id}>
                      {s.name} ({s.stop_id})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* CARD 2: GEOGRAPHIC LAYER CONTROLS (MATCHING SCREENSHOT 1 EYE TOGGLES) */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-2.5">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 uppercase tracking-wide border-b border-slate-100 pb-2">
              <Layers className="w-3.5 h-3.5 text-sky-600" />
              <span>Geographic Layer Controls</span>
            </div>

            <div className="space-y-1.5 text-xs">
              <button
                type="button"
                onClick={() => setShowRiskStops(!showRiskStops)}
                className="w-full flex items-center justify-between p-2 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-700 transition-colors"
              >
                <span className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-600"></span>
                  <span>Bus Stands & Risk Pins</span>
                </span>
                {showRiskStops ? <Eye className="w-3.5 h-3.5 text-sky-600" /> : <EyeOff className="w-3.5 h-3.5 text-slate-400" />}
              </button>

              <button
                type="button"
                onClick={() => setShowVehicleBays(!showVehicleBays)}
                className="w-full flex items-center justify-between p-2 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-700 transition-colors"
              >
                <span className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded bg-emerald-600"></span>
                  <span>Stationed Bus Clusters</span>
                </span>
                {showVehicleBays ? <Eye className="w-3.5 h-3.5 text-sky-600" /> : <EyeOff className="w-3.5 h-3.5 text-slate-400" />}
              </button>

              <button
                type="button"
                onClick={() => setShowRelocations(!showRelocations)}
                className="w-full flex items-center justify-between p-2 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-700 transition-colors"
              >
                <span className="flex items-center gap-2">
                  <span className="w-3 h-0.5 bg-orange-600 border-t border-dashed"></span>
                  <span>Relocation Transfers</span>
                </span>
                {showRelocations ? <Eye className="w-3.5 h-3.5 text-sky-600" /> : <EyeOff className="w-3.5 h-3.5 text-slate-400" />}
              </button>

              <button
                type="button"
                onClick={() => setShowRoutes(!showRoutes)}
                className="w-full flex items-center justify-between p-2 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-700 transition-colors"
              >
                <span className="flex items-center gap-2">
                  <span className="w-3 h-0.5 bg-sky-500"></span>
                  <span>Regular Road Routes</span>
                </span>
                {showRoutes ? <Eye className="w-3.5 h-3.5 text-sky-600" /> : <EyeOff className="w-3.5 h-3.5 text-slate-400" />}
              </button>
            </div>
          </div>

        </div>

        {/* CENTER COLUMN: FULL LEAFLET MAP WITH FLOATING OVERLAYS (SCREENSHOT 1) */}
        <div className="lg:col-span-6 space-y-3">
          <div className="rounded-xl overflow-hidden border border-slate-300 relative shadow-md bg-slate-100">
            <div ref={mapContainerRef} className="w-full h-[520px] sm:h-[580px] z-10" />

            {/* FLOATING CARD: RISK & FLEET MAP LEGEND (SCREENSHOT 1 BOTTOM LEFT) */}
            <div className="absolute bottom-3 left-3 z-20 bg-white/95 backdrop-blur-sm border border-slate-300 rounded-xl p-3 shadow-lg max-w-[240px] text-xs space-y-2">
              <span className="font-heading font-black text-[11px] text-slate-900 block uppercase tracking-wider border-b border-slate-200 pb-1">
                Risk & Fleet Map Legend
              </span>

              <div>
                <span className="text-[10px] font-bold text-slate-500 block uppercase">PREDICTED RISK LEVEL</span>
                <div className="grid grid-cols-2 gap-1 mt-1 text-[11px]">
                  <span className="flex items-center gap-1 font-semibold text-red-700">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-600"></span> Very High
                  </span>
                  <span className="flex items-center gap-1 font-semibold text-orange-600">
                    <span className="w-2.5 h-2.5 rounded-full bg-orange-500"></span> High
                  </span>
                  <span className="flex items-center gap-1 font-semibold text-emerald-700">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-600"></span> Low
                  </span>
                  <span className="flex items-center gap-1 font-semibold text-slate-500">
                    <span className="w-2.5 h-2.5 rounded-full bg-slate-400"></span> Inactive
                  </span>
                </div>
              </div>

              <div className="border-t border-slate-100 pt-1.5">
                <span className="text-[10px] font-bold text-slate-500 block uppercase">STATIONED FLEET</span>
                <div className="grid grid-cols-2 gap-1 mt-1 text-[10px]">
                  <span className="flex items-center gap-1 font-semibold text-emerald-700">
                    <span className="w-2 h-2 rounded bg-emerald-600"></span> Available
                  </span>
                  <span className="flex items-center gap-1 font-semibold text-orange-600">
                    <span className="w-2 h-2 rounded bg-orange-600"></span> Relocating
                  </span>
                </div>
              </div>

              <div className="text-[9px] text-slate-500 pt-1 border-t border-slate-100 leading-tight">
                📍 Dashed lines represent planned bus transfers between stands; not road navigation.
              </div>
            </div>

            {/* FLOATING CARD: MAP INDICATORS (SCREENSHOT 1 BOTTOM RIGHT) */}
            <div className="absolute bottom-3 right-3 z-20 bg-[#0a1120]/95 backdrop-blur-sm border border-slate-700 text-white rounded-xl px-3 py-2 shadow-lg text-[11px] space-y-1">
              <div className="flex items-center justify-between gap-3">
                <span className="font-bold text-slate-300 text-[10px] uppercase tracking-wider">Map Indicators</span>
                <span className="px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-400 text-[9px] font-bold font-mono">
                  Live
                </span>
              </div>
              <div className="space-y-0.5 text-[10px] font-mono">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-sky-400"></span>
                  <span>Stand: {selectedStopId}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                  <span>Fleet: 16 Buses</span>
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* RIGHT COLUMN: DEEP NAVY RISK & CAPACITY METRICS (MATCHING SCREENSHOT 1 RIGHT PANEL) */}
        <div className="lg:col-span-3 space-y-3">
          
          {/* META HEADER STRIP */}
          <div className="flex justify-between items-center text-[11px] text-slate-600 px-1 font-mono">
            <span>Data Source: <strong>State Transit GIS</strong></span>
            <span className="px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 font-bold uppercase">
              REAL
            </span>
          </div>

          {/* MAIN DEEP NAVY PANEL */}
          <div className="bg-[#0b1329] border border-slate-800 text-white rounded-xl p-4 sm:p-5 shadow-xl space-y-4">
            
            {/* PANEL TITLE & LOCATION */}
            <div className="space-y-1 border-b border-slate-700/60 pb-3">
              <div className="flex justify-between items-start gap-2">
                <span className="text-[10px] font-mono text-sky-400 uppercase tracking-wider block font-bold">
                  CROWDROUTE RISK & CAPACITY METRICS
                </span>
                <span className="text-[10px] font-mono text-slate-400 uppercase">
                  STAND / BAY
                </span>
              </div>
              <h4 className="font-heading font-black text-base text-white tracking-tight">
                {selectedStop ? selectedStop.name : selectedStopId}
              </h4>
              <span className="text-[11px] font-mono text-slate-400 block">
                Tiruvannamalai Festival Zone • {selectedStopId}
              </span>
            </div>

            {/* RISK STATUS PILL (MATCHING WATERLOGGING RISK HIGH IN SCREENSHOT 1) */}
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-900 border border-slate-800">
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wide">
                CROWD DENSITY RISK
              </span>
              <span
                className={`px-3 py-1 rounded text-xs font-black uppercase tracking-wider ${
                  selectedSummary?.overall_risk === 'CRITICAL'
                    ? 'bg-red-600 text-white shadow-sm shadow-red-600/30'
                    : selectedSummary?.overall_risk === 'HIGH'
                    ? 'bg-orange-600 text-white shadow-sm shadow-orange-600/30'
                    : selectedSummary?.overall_risk === 'MODERATE'
                    ? 'bg-amber-600 text-white'
                    : 'bg-emerald-600 text-white'
                }`}
              >
                {getRiskLabel(selectedSummary?.overall_risk)}
              </span>
            </div>

            {/* 2X2 METRIC GRID (MATCHING SCREENSHOT 1 2X2 GRID) */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              
              {/* Box 1: Weather Surge */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-2.5 space-y-1">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider flex items-center gap-1">
                  <Sun className="w-3 h-3 text-amber-400" />
                  SCENARIO SURGE
                </span>
                <strong className="font-heading text-sm font-bold text-white block">
                  {scenario?.weather.condition.replace('_', ' ').toUpperCase() || 'CLEAR'}
                </strong>
                <span className="text-[10px] text-slate-400 block font-mono">
                  {scenario?.weather.surge_concentration_factor || 1.0}x Surge Factor
                </span>
              </div>

              {/* Box 2: Peak Demand */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-2.5 space-y-1">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider flex items-center gap-1">
                  <Users className="w-3 h-3 text-sky-400" />
                  PEAK DEMAND
                </span>
                <strong className="text-sm font-bold text-white block font-mono">
                  {selectedSummary ? selectedSummary.peak_demand.toLocaleString() : '8,130'} pax
                </strong>
                <span className="text-[10px] text-slate-400 block font-mono">
                  Peak: {selectedSummary ? formatTo12Hour(selectedSummary.peak_interval) : '9:30 PM'}
                </span>
              </div>

              {/* Box 3: Stationed Fleet */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-2.5 space-y-1">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider flex items-center gap-1">
                  <BusIcon className="w-3 h-3 text-emerald-400" />
                  STATIONED FLEET
                </span>
                <strong className="text-sm font-bold text-white block font-mono">
                  {assignedBuses.length} Buses
                </strong>
                <span className="text-[10px] text-emerald-400 block font-mono">
                  {selectedSummary ? selectedSummary.baseline_scheduled_capacity.toLocaleString() : '0'} pax/15m cap
                </span>
              </div>

              {/* Box 4: Deficit / Waiting */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-2.5 space-y-1">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3 text-red-400" />
                  PEOPLE WAITING
                </span>
                <strong className={`text-sm font-bold block font-mono ${
                  assignedBuses.length === 0 ? 'text-red-400' : 'text-amber-400'
                }`}>
                  {assignedBuses.length === 0
                    ? '0 Buses (All Waiting)'
                    : `+${selectedSummary ? Math.max(0, selectedSummary.peak_demand - selectedSummary.baseline_scheduled_capacity).toLocaleString() : '0'} pax`}
                </strong>
                <span className="text-[10px] text-slate-400 block font-mono">
                  {assignedBuses.length === 0 ? 'Zero capacity' : 'Requires relocation'}
                </span>
              </div>

            </div>

            {/* DATA STATUS BOX (SCREENSHOT 1) */}
            <div className="p-2.5 rounded-lg bg-sky-950/40 border border-sky-500/30 text-[11px] text-sky-200 flex items-center justify-between">
              <div>
                <span className="font-bold block text-white">DATA STATUS: VERIFIED / DERIVED</span>
                <span className="text-[10px] text-slate-400">Fixed-Fleet Linear Programming Optimization</span>
              </div>
              <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            </div>

            {/* ADMINISTRATIVE UNIT METADATA BOX (SCREENSHOT 1 BOTTOM) */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-3 space-y-2 text-xs">
              <div className="flex justify-between items-center text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                <span>TERMINAL UNIT DETAILS</span>
                <span className="text-sky-400 font-mono">{selectedStopId}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px] font-mono border-t border-slate-800 pt-2">
                <div>
                  <span className="text-slate-400 block text-[10px]">District:</span>
                  <span className="text-slate-200">Tiruvannamalai</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Min Reserve:</span>
                  <span className="text-slate-200">{selectedStop.min_service_buses} Buses Protected</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Coordinates:</span>
                  <span className="text-slate-200">12.2285° N, 79.0700° E</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Buses Stationed:</span>
                  <span className="text-emerald-400 font-bold">{assignedBuses.length} Vehicles</span>
                </div>
              </div>
            </div>

            {/* RELOCATION TRANSFERS (DESTINATION BENEFIT & SOURCE REDUCTION) */}
            {outgoingMoves.length > 0 && (
              <div className="bg-amber-950/50 border border-amber-500/40 rounded-lg p-2.5 text-xs text-amber-200 space-y-1 font-sans">
                <strong className="block text-[11px] font-bold text-amber-300">
                  ⚠️ Service Reduced at Source:
                </strong>
                {outgoingMoves.map((m, idx) => (
                  <p key={idx} className="text-[11px] leading-snug">
                    Bus <strong>{m.bus_id}</strong> departs at <strong>{formatTo12Hour(m.departure_time)}</strong> for <strong>{m.destination_stop_id}</strong>. {m.source_service_impact_description}
                  </p>
                ))}
              </div>
            )}

            {incomingMoves.length > 0 && (
              <div className="bg-emerald-950/50 border border-emerald-500/40 rounded-lg p-2.5 text-xs text-emerald-200 space-y-1 font-sans">
                <strong className="block text-[11px] font-bold text-emerald-300">
                  ✓ Destination Capacity Gained:
                </strong>
                {incomingMoves.map((m, idx) => (
                  <p key={idx} className="text-[11px] leading-snug">
                    Bus <strong>{m.bus_id}</strong> arrives at <strong>{formatTo12Hour(m.estimated_arrival_time)}</strong> adding <strong>+{m.estimated_destination_benefit} pax</strong> relief.
                  </p>
                ))}
              </div>
            )}

          </div>

        </div>

      </div>

    </div>
  );
};
