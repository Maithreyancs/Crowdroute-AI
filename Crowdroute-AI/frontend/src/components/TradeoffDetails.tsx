import React from 'react';
import { RejectedCandidate } from '../types/api';
import { ShieldCheck, AlertCircle } from 'lucide-react';

interface TradeoffDetailsProps {
  rejectedMoves: RejectedCandidate[];
}

export const TradeoffDetails: React.FC<TradeoffDetailsProps> = ({ rejectedMoves }) => {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 pb-3 border-b border-slate-200">
        <div>
          <h4 className="font-heading font-bold text-lg text-slate-900">
            Constraint Validation & Rejected Movements Audit
          </h4>
          <p className="text-xs text-slate-500">
            Audits candidate bus movements evaluated and rejected to prevent safety breaches, phantom fleet addition, or late arrivals.
          </p>
        </div>
        <span className="px-2.5 py-1 rounded bg-slate-100 text-slate-700 text-xs font-mono font-bold">
          {rejectedMoves.length} Rejected Candidates Evaluated
        </span>
      </div>

      <div className="overflow-x-auto max-h-64 custom-scrollbar">
        <table className="w-full text-left text-xs bg-white rounded border border-slate-200">
          <thead className="bg-slate-100 text-slate-800 font-bold border-b border-slate-200 sticky top-0">
            <tr>
              <th className="p-2.5">Candidate ID</th>
              <th className="p-2.5">Bus ID</th>
              <th className="p-2.5">Route</th>
              <th className="p-2.5">Constraint Violated</th>
              <th className="p-2.5">Operational Rejection Reason</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-mono">
            {rejectedMoves.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-4 text-center text-slate-400 font-sans">
                  No candidate bus moves were rejected.
                </td>
              </tr>
            ) : (
              rejectedMoves.map((rej, i) => (
                <tr key={`${rej.candidate_id}-${i}`} className="hover:bg-slate-50">
                  <td className="p-2.5 font-bold text-slate-900">{rej.candidate_id}</td>
                  <td className="p-2.5 text-sky-700 font-bold">{rej.bus_id}</td>
                  <td className="p-2.5">
                    {rej.source_stop_id} <span className="text-slate-400">➔</span> {rej.destination_stop_id}
                  </td>
                  <td className="p-2.5">
                    <span className="px-2 py-0.5 rounded bg-red-50 text-red-700 border border-red-200 font-bold text-[10px]">
                      {rej.constraint_violated}
                    </span>
                  </td>
                  <td className="p-2.5 font-sans text-slate-600 max-w-xs">{rej.reason_rejected}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
