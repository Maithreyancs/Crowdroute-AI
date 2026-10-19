import React from 'react';
import { Layers, MapPin, CheckCircle2 } from 'lucide-react';
import { Stop } from '../types/api';

interface AdministrativeStepBarProps {
  stops: Stop[];
  selectedStopId?: string;
  onSelectStop?: (stopId: string) => void;
}

export const AdministrativeStepBar: React.FC<AdministrativeStepBarProps> = ({
  stops,
  selectedStopId = 'STOP_MAIN',
  onSelectStop,
}) => {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-3 pb-1">
      <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-center">
          
          {/* STEP 1: STATE */}
          <div className="lg:col-span-3 space-y-0.5">
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-sky-700 uppercase tracking-wider">
              <span>STEP 1</span>
              <span className="text-slate-400">•</span>
              <span>STATE</span>
            </div>
            <div className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-900">
              <span>Tamil Nadu</span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-sky-100 text-sky-800">
                38 Dists
              </span>
            </div>
          </div>

          {/* STEP 2: DISTRICT */}
          <div className="lg:col-span-3 space-y-0.5">
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-sky-700 uppercase tracking-wider">
              <span>STEP 2</span>
              <span className="text-slate-400">•</span>
              <span>DISTRICT / REGION</span>
            </div>
            <div className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-900">
              <span className="truncate">Tiruvannamalai ★ (Festival Focus)</span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800">
                Active
              </span>
            </div>
          </div>

          {/* STEP 3: KEY BUS STAND / LOCALITY */}
          <div className="lg:col-span-3 space-y-0.5">
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-sky-700 uppercase tracking-wider">
              <span>STEP 3</span>
              <span className="text-slate-400">•</span>
              <span>TERMINAL FOCUS</span>
            </div>
            <select
              value={selectedStopId}
              onChange={(e) => onSelectStop && onSelectStop(e.target.value)}
              className="w-full px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-900 focus:outline-none focus:border-sky-500 cursor-pointer"
            >
              {stops.map((s) => (
                <option key={s.stop_id} value={s.stop_id}>
                  {s.name} ({s.stop_id})
                </option>
              ))}
            </select>
          </div>

          {/* STEP 4: ACTIVE TELEMETRY PILL */}
          <div className="lg:col-span-3 flex lg:justify-end items-center">
            <div className="w-full lg:w-auto px-3.5 py-2 rounded-lg bg-emerald-50 border border-emerald-300 text-emerald-900 flex items-center justify-between lg:justify-start gap-2 shadow-sm">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                <div className="text-left">
                  <span className="font-heading font-black text-xs block leading-tight text-emerald-950">
                    Active Transit GIS
                  </span>
                  <span className="text-[10px] text-emerald-700 block font-mono">
                    16 Buses • Verified Telemetry
                  </span>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};
