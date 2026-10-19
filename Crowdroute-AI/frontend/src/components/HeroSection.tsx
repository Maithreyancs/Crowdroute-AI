import React from 'react';
import { ArrowRight, MapPin, Activity, ShieldCheck, Bus, ExternalLink } from 'lucide-react';

interface HeroSectionProps {
  onScrollToForecast: () => void;
  onScrollToAllocation: () => void;
  onScrollToMap: () => void;
  onReportProblem?: () => void;
}

export const HeroSection: React.FC<HeroSectionProps> = ({
  onScrollToForecast,
  onScrollToAllocation,
  onScrollToMap,
  onReportProblem,
}) => {
  return (
    <section id="hero" className="relative text-white overflow-hidden border-b border-slate-800">
      
      {/* BACKGROUND PHOTOGRAPHY WITH DEEP GRADIENT OVERLAY (MATCHING SCREENSHOT 2 & 3) */}
      <div className="absolute inset-0 z-0">
        <img
          src="/hero_bus_terminal.jpg"
          alt="Aerial city road network and transit interchange"
          className="w-full h-full object-cover object-center scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#060b14]/95 via-[#0a1120]/90 to-[#0c1833]/85" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 py-12 md:py-16 lg:py-20">
        <div className="max-w-3xl space-y-5">
          
          {/* REGIONAL / DEPARTMENT AUTHORITY PILL */}
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/20 text-sky-300 border border-blue-400/30 text-[11px] font-bold tracking-wider uppercase font-mono">
            <span className="w-2 h-2 rounded-full bg-sky-400"></span>
            <span>TAMIL NADU STATE TRANSIT • FESTIVAL EGRESS DECISION SUPPORT</span>
          </div>

          {/* MAIN HEADLINE (MATCHING WATERLOGAI SCREENSHOT 2 & 3 TYPOGRAPHY) */}
          <h1 className="font-heading text-3xl sm:text-5xl lg:text-6xl font-black text-white tracking-tight leading-[1.12]">
            Predict Festival Crowds Before They Overwhelm Transit Stands
          </h1>

          {/* SUBTITLE */}
          <p className="text-sm sm:text-base md:text-lg text-slate-300 leading-relaxed font-normal max-w-2xl">
            AI-powered festival crowd surge prediction and fixed-fleet bus relocation response for transport controllers and municipal authorities.
          </p>

          {/* ACTION BUTTONS (MATCHING SCREENSHOT 2 & 3 BUTTON PAIR) */}
          <div className="flex flex-wrap items-center gap-3.5 pt-2">
            
            {/* Primary Blue CTA: OPEN BUS MAP */}
            <button
              onClick={onScrollToMap}
              className="inline-flex items-center gap-2.5 px-6 py-3 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm shadow-lg shadow-blue-600/30 transition-all hover:translate-y-[-1px]"
            >
              <MapPin className="w-4 h-4 text-sky-200" />
              <span>OPEN BUS MAP</span>
            </button>

            {/* Secondary Dark CTA: VIEW PRIORITY CORRIDORS */}
            <button
              onClick={onScrollToAllocation}
              className="inline-flex items-center gap-2.5 px-6 py-3 rounded-lg bg-slate-900/80 hover:bg-slate-800 text-white font-bold text-sm border border-slate-700 shadow-sm transition-all hover:translate-y-[-1px]"
            >
              <Activity className="w-4 h-4 text-amber-400" />
              <span>VIEW PRIORITY STANDS →</span>
            </button>

            {onReportProblem && (
              <button
                onClick={onReportProblem}
                className="inline-flex items-center gap-2 px-4 py-3 rounded-lg bg-red-600/20 hover:bg-red-600/30 text-red-300 border border-red-500/30 text-xs font-bold transition-all"
              >
                <span>Report Problem</span>
              </button>
            )}

          </div>

          {/* FOOTER BADGES */}
          <div className="pt-2 flex flex-wrap items-center gap-4 text-xs text-slate-400">
            <span className="inline-flex items-center gap-1.5 text-emerald-400 font-semibold font-mono">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Strict Fleet Conservation: 16 Buses Fixed</span>
            </span>
            <span className="text-slate-600">•</span>
            <span>Zero phantom vehicles • Guaranteed source-stop reserve minimums</span>
          </div>

        </div>
      </div>

    </section>
  );
};
