import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import {
  ComplaintCategory,
  ComplaintCreate,
  ComplaintPublicItem,
  ComplaintResponse,
  Stop,
} from '../types/api';
import {
  AlertCircle,
  CheckCircle2,
  Send,
  Search,
  MessageSquare,
  Clock,
  ShieldCheck,
  MapPin,
  RefreshCw,
} from 'lucide-react';

interface ComplaintSectionProps {
  stops: Stop[];
}

const CATEGORIES: ComplaintCategory[] = [
  'Overcrowding',
  'Bus Not Available',
  'Bus Delay',
  'Long Waiting Time',
  'Stop Facilities',
  'Other',
];

export const ComplaintSection: React.FC<ComplaintSectionProps> = ({ stops }) => {
  // Form State
  const [category, setCategory] = useState<ComplaintCategory>('Overcrowding');
  const [stopId, setStopId] = useState<string>('STOP_MAIN');
  const [customLocation, setCustomLocation] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [incidentTime, setIncidentTime] = useState<string>('');
  const [contactPhone, setContactPhone] = useState<string>('');
  const [contactEmail, setContactEmail] = useState<string>('');

  // UI States
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submissionSuccess, setSubmissionSuccess] = useState<ComplaintResponse | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // Tracking State
  const [trackRefId, setTrackRefId] = useState<string>('');
  const [trackedRecord, setTrackedRecord] = useState<ComplaintResponse | null>(null);
  const [trackError, setTrackError] = useState<string | null>(null);
  const [isTracking, setIsTracking] = useState<boolean>(false);

  // Public Feed State
  const [publicFeed, setPublicFeed] = useState<ComplaintPublicItem[]>([]);
  const [isLoadingFeed, setIsLoadingFeed] = useState<boolean>(false);

  // Load public complaints list on mount
  const fetchPublicComplaints = async () => {
    setIsLoadingFeed(true);
    try {
      const items = await api.getPublicComplaints();
      setPublicFeed(items);
    } catch (err) {
      console.warn('Failed to load public complaints feed:', err);
    } finally {
      setIsLoadingFeed(false);
    }
  };

  useEffect(() => {
    fetchPublicComplaints();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSubmissionSuccess(null);

    const locationChoice = stopId === 'OTHER' ? customLocation.trim() : stopId;

    if (!locationChoice) {
      setFormError('Please select or specify the bus stop location.');
      return;
    }

    if (description.trim().length < 5) {
      setFormError('Please describe the problem in at least 5 characters.');
      return;
    }

    const payload: ComplaintCreate = {
      category,
      stop_id: locationChoice,
      description: description.trim(),
      incident_time: incidentTime.trim() || undefined,
      contact_phone: contactPhone.trim() || undefined,
      contact_email: contactEmail.trim() || undefined,
    };

    setIsSubmitting(true);
    try {
      const response = await api.submitComplaint(payload);
      setSubmissionSuccess(response);
      // Reset form
      setDescription('');
      setIncidentTime('');
      setContactPhone('');
      setContactEmail('');
      // Refresh public feed
      await fetchPublicComplaints();
    } catch (err: any) {
      setFormError(err.message || 'Failed to submit report. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTrack = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trackRefId.trim()) return;

    setIsTracking(true);
    setTrackError(null);
    setTrackedRecord(null);
    try {
      const result = await api.trackComplaint(trackRefId.trim());
      setTrackedRecord(result);
    } catch (err: any) {
      setTrackError(err.message || 'Report not found. Please check your reference code.');
    } finally {
      setIsTracking(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Resolved':
        return 'bg-emerald-100 text-emerald-800 border-emerald-300';
      case 'Under Review':
        return 'bg-amber-100 text-amber-800 border-amber-300';
      case 'Received':
      default:
        return 'bg-sky-100 text-sky-800 border-sky-300';
    }
  };

  return (
    <section id="complaints" className="max-w-7xl mx-auto px-4 sm:px-6 py-12 space-y-8">
      
      {/* SECTION TITLE BAR */}
      <div className="pb-4 border-b-2 border-slate-200 space-y-1">
        <div className="text-xs font-bold text-sky-700 tracking-wider uppercase">
          CITIZEN GRIEVANCE PORTAL
        </div>
        <h2 className="font-heading text-3xl font-bold text-slate-900 tracking-tight">
          Report a Problem
        </h2>
        <p className="text-sm text-slate-600 max-w-2xl">
          Report overcrowding, bus delays, or safety issues directly to transport controllers during the festival. All submissions receive an official reference code.
        </p>
      </div>

      {/* DEMO NOTICE DISCLAIMER */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-800 flex items-start gap-3">
        <ShieldCheck className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <strong>Citizen Notice & Demonstration Disclosure: </strong>
          <span>
            This grievance portal is a functional demonstration prototype for the SAKTHI HACKFEST'26 transport portal. Reports are securely stored in the system database for controller response simulation. In genuine emergencies, call the Toll-Free Helpline at <strong>1800-425-4333</strong>.
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* LEFT COLUMN: COMPLAINT SUBMISSION FORM */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-6 sm:p-7 shadow-sm space-y-6">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
            <MessageSquare className="w-5 h-5 text-orange-600" />
            <h3 className="font-heading font-bold text-lg text-slate-900">
              Submit a Public Transport Grievance
            </h3>
          </div>

          {/* SUCCESS MESSAGE BANNER */}
          {submissionSuccess && (
            <div className="bg-emerald-50 border border-emerald-300 rounded-xl p-4 text-xs text-emerald-900 space-y-2 animate-fadeIn">
              <div className="flex items-center gap-2 font-bold text-emerald-800 text-sm">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <span>Your problem report has been successfully recorded!</span>
              </div>
              <p>
                Your unique tracking reference code is:{' '}
                <strong className="font-mono text-sm bg-white px-2 py-0.5 rounded border border-emerald-300 text-slate-900">
                  {submissionSuccess.reference_id}
                </strong>
              </p>
              <p className="text-emerald-700">
                Status: <strong>{submissionSuccess.status}</strong> • Keep this reference number to check updates.
              </p>
            </div>
          )}

          {/* ERROR MESSAGE BANNER */}
          {formError && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-800 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            
            {/* CATEGORY & LOCATION */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">
                  Problem Category *
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as ComplaintCategory)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  required
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">
                  Bus Stand / Location *
                </label>
                <select
                  value={stopId}
                  onChange={(e) => setStopId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  required
                >
                  {stops.map((s) => (
                    <option key={s.stop_id} value={s.stop_id}>
                      {s.name} ({s.stop_id})
                    </option>
                  ))}
                  <option value="OTHER">Other / Specific Street Location</option>
                </select>
              </div>
            </div>

            {stopId === 'OTHER' && (
              <div className="space-y-1 animate-fadeIn">
                <label className="text-xs font-semibold text-slate-700">
                  Specify Location Name *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Near East Car Street parking lot"
                  value={customLocation}
                  onChange={(e) => setCustomLocation(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-sky-500"
                  required
                />
              </div>
            )}

            {/* DESCRIPTION */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700">
                Describe What Happened *
              </label>
              <textarea
                rows={3}
                placeholder="Explain the overcrowding, missing buses, delays, or safety concern clearly..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-sky-500"
                required
              />
              <span className="text-[11px] text-slate-400">
                Provide sufficient detail to help transport controllers resolve the issue.
              </span>
            </div>

            {/* OPTIONAL TIME & CONTACTS */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600">
                  Time of Incident (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. 9:40 PM"
                  value={incidentTime}
                  onChange={(e) => setIncidentTime(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600">
                  Phone (Optional for follow-up)
                </label>
                <input
                  type="tel"
                  placeholder="e.g. 9876543210"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600">
                  Email (Optional)
                </label>
                <input
                  type="email"
                  placeholder="name@email.com"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>
            </div>

            <p className="text-[11px] text-slate-500 italic">
              * Privacy Guarantee: Your phone number and email are never shown in public complaint lists.
            </p>

            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center justify-center gap-2 w-full sm:w-auto px-6 py-2.5 rounded-lg bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white font-semibold text-xs shadow-md shadow-orange-600/20 transition-all"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{isSubmitting ? 'Recording Report...' : 'Submit Report'}</span>
            </button>

          </form>
        </div>

        {/* RIGHT COLUMN: TRACK COMPLAINT & RECENT PUBLIC GRIEVANCE FEED */}
        <div className="lg:col-span-5 space-y-6">
          
          {/* TRACK EXISTING REPORT CARD */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3">
            <h3 className="font-heading font-bold text-sm text-slate-900 flex items-center gap-1.5">
              <Search className="w-4 h-4 text-sky-600" />
              <span>Track Existing Report Status</span>
            </h3>
            
            <form onSubmit={handleTrack} className="flex gap-2">
              <input
                type="text"
                placeholder="Enter Code, e.g. CR-2026-XXXX"
                value={trackRefId}
                onChange={(e) => setTrackRefId(e.target.value)}
                className="flex-1 px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-mono uppercase focus:outline-none focus:ring-2 focus:ring-sky-500"
                required
              />
              <button
                type="submit"
                disabled={isTracking}
                className="px-4 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-semibold"
              >
                {isTracking ? 'Searching...' : 'Track'}
              </button>
            </form>

            {trackError && (
              <div className="text-[11px] text-red-600 bg-red-50 p-2 rounded border border-red-200">
                {trackError}
              </div>
            )}

            {trackedRecord && (
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs space-y-1.5 animate-fadeIn">
                <div className="flex justify-between items-center">
                  <span className="font-mono font-bold text-slate-900">{trackedRecord.reference_id}</span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold border uppercase ${getStatusBadge(trackedRecord.status)}`}>
                    {trackedRecord.status}
                  </span>
                </div>
                <div>Category: <strong>{trackedRecord.category}</strong> at <strong>{trackedRecord.stop_id}</strong></div>
                <div className="text-slate-600 text-[11px]">"{trackedRecord.description}"</div>
                <div className="text-[10px] text-slate-400">Reported at: {trackedRecord.created_at}</div>
              </div>
            )}
          </div>

          {/* RECENT CITIZEN REPORTS FEED */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3">
            <div className="flex justify-between items-center pb-2 border-b border-slate-100">
              <h3 className="font-heading font-bold text-sm text-slate-900">
                Recent Public Reports ({publicFeed.length})
              </h3>
              <button
                onClick={fetchPublicComplaints}
                disabled={isLoadingFeed}
                className="text-slate-400 hover:text-slate-600"
                title="Refresh feed"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingFeed ? 'animate-spin' : ''}`} />
              </button>
            </div>

            <div className="space-y-2.5 max-h-72 overflow-y-auto custom-scrollbar pr-1">
              {publicFeed.length === 0 ? (
                <div className="text-center py-6 text-xs text-slate-400">
                  No grievances reported yet for this festival window.
                </div>
              ) : (
                publicFeed.slice(0, 10).map((item) => (
                  <div
                    key={item.reference_id}
                    className="p-3 rounded-lg border border-slate-100 bg-slate-50/70 space-y-1 text-xs"
                  >
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-1.5 font-semibold text-slate-800">
                        <span className="w-1.5 h-1.5 rounded-full bg-orange-500"></span>
                        <span>{item.category}</span>
                      </div>
                      <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold border uppercase ${getStatusBadge(item.status)}`}>
                        {item.status}
                      </span>
                    </div>

                    <p className="text-slate-600 text-[11px] line-clamp-2">
                      {item.description}
                    </p>

                    <div className="flex justify-between items-center text-[10px] text-slate-400 font-mono pt-0.5">
                      <span>Location: {item.stop_id}</span>
                      <span>Ref: {item.reference_id}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>

      </div>

    </section>
  );
};
