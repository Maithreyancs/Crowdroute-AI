import React from 'react';
import { Bus, Phone, ShieldCheck, ArrowUp } from 'lucide-react';

export const Footer: React.FC = () => {
  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <footer className="bg-slate-900 text-slate-400 text-sm border-t-4 border-orange-600">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          
          {/* COL 1: BRAND */}
          <div className="space-y-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded bg-sky-600 text-white flex items-center justify-center font-bold">
                <Bus className="w-4 h-4" />
              </div>
              <span className="font-heading text-lg font-bold text-white tracking-tight">
                CrowdRoute <span className="text-sky-400">AI</span>
              </span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Public Service Festival Crowd Prediction & Fixed-Fleet Bus Optimization System for Municipal Transport Authorities.
            </p>
            <div className="inline-block px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[11px] font-mono border border-slate-700">
              SAKTHI HACKFEST'26 • Generative AI Domain
            </div>
          </div>

          {/* COL 2: PUBLIC PORTALS */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider">
              Public Services
            </h4>
            <ul className="space-y-2 text-xs">
              <li>
                <a href="#hero" className="hover:text-white transition-colors">
                  Portal Home
                </a>
              </li>
              <li>
                <a href="#crowd-forecast" className="hover:text-white transition-colors">
                  Festival Crowd Forecast
                </a>
              </li>
              <li>
                <a href="#bus-allocation" className="hover:text-white transition-colors">
                  Recommended Bus Deployment
                </a>
              </li>
              <li>
                <a href="#about" className="hover:text-white transition-colors">
                  About Decision Support System
                </a>
              </li>
            </ul>
          </div>

          {/* COL 3: OPERATIONAL STANDARDS */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider">
              Audited Standards
            </h4>
            <ul className="space-y-2 text-xs">
              <li className="flex items-center gap-1.5 text-slate-300">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>100% Fixed-Fleet Conservation</span>
              </li>
              <li>Explainable Gaussian Egress Curves</li>
              <li>Safety Minimums at Donor Stops</li>
              <li>Standardized 15-Min Boarding Rates</li>
            </ul>
          </div>

          {/* COL 4: HELPLINE & CONTACT */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider">
              Control Helpline
            </h4>
            <div className="space-y-1 text-xs">
              <div className="text-slate-300 font-medium">Emergency Control Room:</div>
              <div className="font-mono text-white text-sm font-bold flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-orange-400" />
                <span>1800-425-4333 (Toll Free)</span>
              </div>
              <div className="text-slate-400 pt-1">
                Hours: 24 Hours / 7 Days Active
              </div>
              <div className="text-slate-500 text-[11px]">
                Tamil Nadu State Transport Coordination Centre
              </div>
            </div>
          </div>

        </div>

        {/* BOTTOM BAR */}
        <div className="mt-12 pt-6 border-t border-slate-800 flex flex-col sm:flex-row justify-between items-center gap-3 text-xs text-slate-500">
          <div>
            © 2026 CrowdRoute AI — State Festival Transport Operations Portal. All rights reserved.
          </div>
          <div className="flex items-center gap-4">
            <span>Decision Support System • Audited Dispatch Logic</span>
            <button
              onClick={scrollToTop}
              className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
              title="Back to top"
            >
              <ArrowUp className="w-4 h-4" />
            </button>
          </div>
        </div>

      </div>
    </footer>
  );
};
