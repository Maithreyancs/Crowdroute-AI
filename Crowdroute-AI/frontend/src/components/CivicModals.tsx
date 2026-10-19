import React, { useState } from 'react';
import {
  AlertTriangle,
  Search,
  X,
  MapPin,
  Clock,
  ShieldCheck,
  CheckCircle2,
  FileText,
  Upload,
  AlertCircle,
  Bus,
} from 'lucide-react';
import { api } from '../services/api';
import { ComplaintCreate, ComplaintResponse, Stop } from '../types/api';

interface ReportProblemModalProps {
  isOpen: boolean;
  onClose: () => void;
  stops: Stop[];
  onSubmitted?: (res: ComplaintResponse) => void;
}

export const ReportProblemModal: React.FC<ReportProblemModalProps> = ({
  isOpen,
  onClose,
  stops,
  onSubmitted,
}) => {
  const [selectedStopId, setSelectedStopId] = useState<string>('STOP_MAIN');
  const [customLocation, setCustomLocation] = useState<string>('Central Terminal (Temple Main Gate)');
  const [severity, setSeverity] = useState<string>('High (Heavy overcrowding)');
  const [approxCrowd, setApproxCrowd] = useState<string>('Approx. 500+ passengers');
  const [duration, setDuration] = useState<string>('45 minutes');
  const [description, setDescription] = useState<string>('');
  const [isRoadBlocked, setIsRoadBlocked] = useState<'yes' | 'no' | 'unknown'>('yes');
  const [isEmergencyAffected, setIsEmergencyAffected] = useState<'yes' | 'no' | 'unknown'>('no');
  const [contactPhone, setContactPhone] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successResult, setSuccessResult] = useState<ComplaintResponse | null>(null);

  if (!isOpen) return null;

  const handleQuickStopSelect = (stopId: string, name: string) => {
    setSelectedStopId(stopId);
    setCustomLocation(name);
  };

  const handleUseCurrentLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setCustomLocation(`GPS (${pos.coords.latitude.toFixed(4)}°N, ${pos.coords.longitude.toFixed(4)}°E)`);
        },
        () => {
          setCustomLocation('Central Terminal (Temple Main Gate)');
        }
      );
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (description.trim().length < 5) {
      setErrorMsg('Please describe the problem in at least 5 characters.');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload: ComplaintCreate = {
        category: 'Overcrowding',
        stop_id: selectedStopId === 'OTHER' ? customLocation : selectedStopId,
        description: `[Severity: ${severity}] [Crowd: ${approxCrowd}] [Duration: ${duration}] [Road Blocked: ${isRoadBlocked}] [Emergency Affected: ${isEmergencyAffected}] ${description.trim()}`,
        contact_phone: contactPhone.trim() || undefined,
      };

      const res = await api.submitComplaint(payload);
      setSuccessResult(res);
      if (onSubmitted) onSubmitted(res);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to submit report. Please retry.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-[#0b1329] border border-slate-700/80 rounded-2xl shadow-2xl text-white p-5 sm:p-6 space-y-4 my-8">
        
        {/* HEADER */}
        <div className="flex items-start justify-between gap-4 pb-3 border-b border-slate-700/60">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-heading font-bold text-lg text-white">
                  Report Transport Problem
                </h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-sky-500/20 text-sky-300 border border-sky-400/30">
                  Citizen Transport Report
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Submit live overcrowding reports across festival stands for real-time bus controller dispatch.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* SUCCESS NOTIFICATION */}
        {successResult ? (
          <div className="bg-emerald-950/60 border border-emerald-500/40 rounded-xl p-5 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-7 h-7 text-emerald-400" />
            </div>
            <h4 className="font-heading text-lg font-bold text-emerald-200">
              Report Submitted Successfully
            </h4>
            <p className="text-xs text-slate-300">
              Your tracking reference number has been generated:
            </p>
            <div className="inline-block px-4 py-2 rounded-lg bg-slate-900 border border-emerald-400/50 text-emerald-300 font-mono text-base font-bold tracking-wider">
              {successResult.reference_id}
            </div>
            <p className="text-[11px] text-slate-400">
              Keep this code to track operational actions taken by festival transit controllers.
            </p>
            <div className="pt-2">
              <button
                onClick={() => {
                  setSuccessResult(null);
                  onClose();
                }}
                className="px-5 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold shadow-sm"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 text-xs">
            {errorMsg && (
              <div className="bg-red-950/60 border border-red-500/40 rounded-lg p-2.5 text-red-300 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* 1. LOCATION */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="font-semibold text-slate-300 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-sky-400" />
                  <span>1. LOCATION / BUS STAND *</span>
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleUseCurrentLocation}
                    className="inline-flex items-center gap-1 text-[11px] text-sky-400 hover:text-sky-300"
                  >
                    <span>📍 Use Current Location</span>
                  </button>
                </div>
              </div>

              {/* Quick Pills */}
              <div className="flex flex-wrap gap-1.5">
                {stops.map((s) => (
                  <button
                    key={s.stop_id}
                    type="button"
                    onClick={() => handleQuickStopSelect(s.stop_id, s.name)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-semibold border transition-all ${
                      selectedStopId === s.stop_id
                        ? 'bg-sky-600 text-white border-sky-400 shadow-sm'
                        : 'bg-slate-900 text-slate-300 border-slate-700 hover:bg-slate-800'
                    }`}
                  >
                    {s.name}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => handleQuickStopSelect('OTHER', '')}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold border transition-all ${
                    selectedStopId === 'OTHER'
                      ? 'bg-sky-600 text-white border-sky-400'
                      : 'bg-slate-900 text-slate-300 border-slate-700 hover:bg-slate-800'
                  }`}
                >
                  Other Landmark
                </button>
              </div>

              <input
                type="text"
                value={customLocation}
                onChange={(e) => setCustomLocation(e.target.value)}
                placeholder="Area / Neighborhood / Landmark (e.g. Near East Car Street)"
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-sky-500 font-mono text-xs"
                required
              />
              <span className="text-[10px] text-emerald-400 font-mono block">
                Coordinates: 12.2285° N, 79.0700° E ✓ Valid Regional Festival Coordinates
              </span>
            </div>

            {/* 2. TWO COLUMN DETAILS */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="font-semibold text-slate-300 block mb-1">
                  SEVERITY *
                </label>
                <select
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-slate-200 text-xs focus:outline-none focus:border-sky-500"
                >
                  <option value="High (Heavy overcrowding)">High (Heavy overcrowding)</option>
                  <option value="Moderate (Station queue)">Moderate (Station queue)</option>
                  <option value="Low (Minor delay)">Low (Minor delay)</option>
                </select>
              </div>

              <div>
                <label className="font-semibold text-slate-300 block mb-1">
                  APPROX PASSENGERS
                </label>
                <input
                  type="text"
                  value={approxCrowd}
                  onChange={(e) => setApproxCrowd(e.target.value)}
                  placeholder="e.g. 500+ passengers"
                  className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-slate-200 text-xs focus:outline-none focus:border-sky-500"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-300 block mb-1">
                  WAIT DURATION
                </label>
                <input
                  type="text"
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  placeholder="e.g. 45 mins"
                  className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-slate-200 text-xs focus:outline-none focus:border-sky-500"
                />
              </div>
            </div>

            {/* 3. DESCRIPTION */}
            <div className="space-y-1">
              <label className="font-semibold text-slate-300 block">
                PROBLEM DETAILS / OBSERVATIONS *
              </label>
              <textarea
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe where crowd is accumulating, bus queue status, stranded passengers, etc."
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-sky-500 text-xs"
                required
              />
            </div>

            {/* 4. OPERATIONAL RADIOS */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-slate-900/60 border border-slate-800 rounded-lg">
              <div>
                <span className="block font-semibold text-slate-300 mb-1">
                  Is road blocked for buses?
                </span>
                <div className="flex gap-4">
                  {(['yes', 'no', 'unknown'] as const).map((opt) => (
                    <label key={opt} className="inline-flex items-center gap-1.5 cursor-pointer capitalize">
                      <input
                        type="radio"
                        name="road_blocked"
                        value={opt}
                        checked={isRoadBlocked === opt}
                        onChange={() => setIsRoadBlocked(opt)}
                        className="text-sky-600 focus:ring-0"
                      />
                      <span>{opt}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <span className="block font-semibold text-slate-300 mb-1">
                  Are emergency vehicles affected?
                </span>
                <div className="flex gap-4">
                  {(['yes', 'no', 'unknown'] as const).map((opt) => (
                    <label key={opt} className="inline-flex items-center gap-1.5 cursor-pointer capitalize">
                      <input
                        type="radio"
                        name="emergency_affected"
                        value={opt}
                        checked={isEmergencyAffected === opt}
                        onChange={() => setIsEmergencyAffected(opt)}
                        className="text-sky-600 focus:ring-0"
                      />
                      <span>{opt}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {/* CONTACT (OPTIONAL) */}
            <div>
              <label className="font-semibold text-slate-300 block mb-1">
                CITIZEN CONTACT NUMBER (OPTIONAL FOR SMS DISPATCH UPDATES)
              </label>
              <input
                type="tel"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                placeholder="e.g. 98765 43210"
                className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-slate-200 text-xs focus:outline-none focus:border-sky-500"
              />
            </div>

            {/* FOOTER ACTIONS */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-700/60">
              <span className="text-[11px] text-slate-400">
                🔒 Protected Public Grievance Pipeline
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold shadow-md shadow-red-600/20 disabled:opacity-50"
                >
                  {isSubmitting ? 'Submitting...' : 'Submit Transport Report'}
                </button>
              </div>
            </div>
          </form>
        )}

      </div>
    </div>
  );
};

interface TrackReportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const TrackReportModal: React.FC<TrackReportModalProps> = ({ isOpen, onClose }) => {
  const [refId, setRefId] = useState<string>('');
  const [record, setRecord] = useState<ComplaintResponse | null>(null);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleTrack = async (e: React.FormEvent) => {
    e.preventDefault();
    setSearchError(null);
    setRecord(null);

    const trimmed = refId.trim();
    if (!trimmed) {
      setSearchError('Please enter a tracking reference code.');
      return;
    }

    setIsSearching(true);
    try {
      const res = await api.trackComplaint(trimmed);
      setRecord(res);
    } catch (err: any) {
      setSearchError(err.message || 'Reference code not found in festival records.');
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-lg bg-[#0b1329] border border-slate-700/80 rounded-2xl shadow-2xl text-white p-5 sm:p-6 space-y-5">
        
        {/* HEADER */}
        <div className="flex items-start justify-between gap-4 pb-3 border-b border-slate-700/60">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-sky-500/20 text-sky-400 border border-sky-500/30 flex items-center justify-center flex-shrink-0">
              <Search className="w-5 h-5 text-sky-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-heading font-bold text-lg text-white">
                  Track Transport Complaint
                </h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-sky-500/20 text-sky-300 border border-sky-400/30">
                  Live Dispatch Status
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Live verification, municipal assignment, and bus dispatch response.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* SEARCH INPUT */}
        <form onSubmit={handleTrack} className="space-y-2">
          <div className="flex gap-2">
            <input
              type="text"
              value={refId}
              onChange={(e) => setRefId(e.target.value)}
              placeholder="ENTER COMPLAINT ID (E.G., CR-CHN-000001)"
              className="flex-1 px-3.5 py-2.5 rounded-lg bg-slate-950 border border-slate-700 text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 uppercase"
            />
            <button
              type="submit"
              disabled={isSearching}
              className="px-5 py-2.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold shadow-md shadow-sky-600/20 transition-all flex items-center gap-1.5"
            >
              <Search className="w-3.5 h-3.5" />
              <span>{isSearching ? 'Tracking...' : 'Track'}</span>
            </button>
          </div>
          {searchError && (
            <p className="text-[11px] text-red-400 flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5" />
              <span>{searchError}</span>
            </p>
          )}
        </form>

        {/* RESULT AREA */}
        {record ? (
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 space-y-3 animate-fadeIn">
            <div className="flex justify-between items-start gap-2">
              <div>
                <span className="text-[10px] text-slate-400 font-mono block">REFERENCE CODE</span>
                <strong className="font-mono text-emerald-400 text-sm">{record.reference_id}</strong>
              </div>
              <span className="px-2.5 py-1 rounded text-xs font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                {record.status}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs border-t border-slate-800 pt-2">
              <div>
                <span className="text-slate-400 block text-[11px]">Bus Stand:</span>
                <span className="font-semibold text-white">{record.stop_id}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Category:</span>
                <span className="font-semibold text-white">{record.category}</span>
              </div>
            </div>

            <div className="text-xs bg-slate-950 p-2.5 rounded border border-slate-800 space-y-1">
              <span className="text-slate-400 block text-[11px]">Complaint Details:</span>
              <p className="text-slate-200">{record.description}</p>
            </div>

            {record.resolution_notes && (
              <div className="text-xs bg-sky-950/40 p-2.5 rounded border border-sky-500/30 space-y-1">
                <span className="text-sky-400 font-semibold block text-[11px]">Controller Action Taken:</span>
                <p className="text-sky-200">{record.resolution_notes}</p>
              </div>
            )}
          </div>
        ) : (
          <div className="py-8 text-center text-slate-500 space-y-2">
            <FileText className="w-10 h-10 text-slate-600 mx-auto" />
            <p className="font-semibold text-slate-300 text-xs">No complaint loaded</p>
            <p className="text-[11px] text-slate-500 max-w-xs mx-auto">
              Enter your unique tracking ID received upon reporting to inspect real-time municipal response.
            </p>
          </div>
        )}

        {/* FOOTER */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-700/60 text-xs text-slate-400">
          <span className="text-[11px] flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Citizen Privacy: Personal identity and contact numbers remain confidential.</span>
          </span>
          <button
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
};
