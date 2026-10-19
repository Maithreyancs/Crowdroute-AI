import React, { useState, useRef } from 'react';
import { UploadCloud, FileText, CheckCircle2, AlertTriangle, Download, Database } from 'lucide-react';
import { ActualVsPredictedSummary, HistoricalUploadResponse } from '../types/api';

interface HistoricalUploadProps {
  onUploadFile: (file: File) => Promise<HistoricalUploadResponse>;
  onLoadSampleCsv: () => Promise<void>;
  uploadResult: HistoricalUploadResponse | null;
  accuracy: ActualVsPredictedSummary | null | undefined;
  isLoading?: boolean;
}

export const HistoricalUpload: React.FC<HistoricalUploadProps> = ({
  onUploadFile,
  onLoadSampleCsv,
  uploadResult,
  accuracy,
  isLoading = false,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    setErrorMsg(null);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setErrorMsg(null);
    if (e.target.files && e.target.files.length > 0) {
      await processFile(e.target.files[0]);
    }
  };

  const processFile = async (file: File) => {
    try {
      await onUploadFile(file);
    } catch (err: any) {
      setErrorMsg(err.message || 'File upload failed');
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-6">
      
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-4 border-b border-slate-200">
        <div>
          <h3 className="font-heading font-bold text-xl text-slate-900">
            Past Crowd Data & Historical Calibration
          </h3>
          <p className="text-xs text-slate-500">
            Upload past festival passenger counts (CSV / Excel) or load our synthetic demo dataset to calibrate interval departure curves.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onLoadSampleCsv}
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-sky-700 hover:bg-sky-800 text-white text-xs font-semibold shadow-sm"
          >
            <Database className="w-3.5 h-3.5" />
            <span>Load Sample Data</span>
          </button>
          <a
            href="/api/historical/sample"
            download="sample_festival_historical_data.csv"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-xs font-semibold shadow-sm"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            <span>Download CSV</span>
          </a>
          <a
            href="/api/historical/sample.xlsx"
            download="sample_festival_historical_data.xlsx"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-xs font-semibold shadow-sm"
          >
            <Download className="w-3.5 h-3.5 text-emerald-600" />
            <span>Download Excel (.xlsx)</span>
          </a>
        </div>
      </div>

      {/* DROPZONE */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept=".csv, .xlsx, .xls"
        className="hidden"
      />

      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
          isDragging
            ? 'border-sky-500 bg-sky-50'
            : 'border-slate-300 hover:border-sky-500 bg-slate-50/60'
        }`}
      >
        <div className="w-14 h-14 mx-auto rounded-full bg-sky-100 text-sky-700 flex items-center justify-center mb-3">
          <UploadCloud className="w-7 h-7" />
        </div>
        <h4 className="font-bold text-sm text-slate-900">
          Upload Past Festival Records (CSV or Excel)
        </h4>
        <p className="text-xs text-slate-500 mt-1">
          Required columns: <code className="bg-slate-200 px-1 py-0.5 rounded text-slate-800">time</code> (HH:MM), <code className="bg-slate-200 px-1 py-0.5 rounded text-slate-800">stop_id</code>, <code className="bg-slate-200 px-1 py-0.5 rounded text-slate-800">passengers</code>
        </p>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            fileInputRef.current?.click();
          }}
          className="mt-4 px-4 py-1.5 rounded bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-xs font-semibold shadow-sm"
        >
          Select File from Computer
        </button>
      </div>

      {/* ERROR NOTICE */}
      {errorMsg && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* UPLOAD STATUS PANEL */}
      {uploadResult && (
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 pb-2 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <span
                className={`px-2 py-0.5 rounded text-[11px] font-bold uppercase ${
                  uploadResult.status === 'SUCCESS'
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-amber-100 text-amber-800'
                }`}
              >
                {uploadResult.status}
              </span>
              <span className="font-mono text-xs font-bold text-slate-800">
                {uploadResult.filename}
              </span>
            </div>

            {uploadResult.filename.toLowerCase().includes('sample') ? (
              <span className="px-2.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-300 text-xs font-bold">
                Calibrated with Synthetic Historical Demo Data
              </span>
            ) : (
              <span className="px-2.5 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-300 text-xs font-bold">
                Calibrated with User Historical Upload
              </span>
            )}
          </div>

          <div className="text-xs text-slate-600 space-y-1">
            <div>
              Valid rows: <strong>{uploadResult.valid_rows}</strong> • Rejected rows: <strong>{uploadResult.invalid_rows_count}</strong> • Total historical passengers: <strong>{uploadResult.total_passenger_count.toLocaleString()}</strong>
            </div>
            <div className="font-mono text-[11px] text-slate-500">
              Coverage: {uploadResult.stop_ids_found.join(', ')} • {uploadResult.records.length} time intervals ingested
            </div>
          </div>

          {/* SAMPLES NOTICE IF DEMO DATA */}
          {uploadResult.filename.toLowerCase().includes('sample') && (
            <div className="bg-amber-50/70 border border-amber-200 rounded p-2.5 text-xs text-amber-800 space-y-0.5">
              <strong className="block font-bold">Synthetic Historical Dataset Disclosure:</strong>
              <span>
                These sample records are synthetic demonstration data based on the Maha Deepam closing ceremony. 
                They are used to test empirical interval departure calibrations without exposing real citizen ticketing data.
              </span>
            </div>
          )}

          {uploadResult.validation_errors && uploadResult.validation_errors.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded p-2.5 text-xs text-amber-800 space-y-1">
              <div className="font-bold">Validation Notices:</div>
              <ul className="list-disc list-inside space-y-0.5">
                {uploadResult.validation_errors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* MODEL ACCURACY VALIDATION PANEL */}
      {accuracy && accuracy.intervals_compared > 0 && (
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3">
          <div className="flex justify-between items-center pb-2 border-b border-slate-200">
            <h4 className="font-semibold text-sm text-slate-900">
              Empirical Calibration & Model Accuracy
            </h4>
            <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-300 text-xs font-bold font-mono">
              MAPE: {accuracy.overall_mape}%
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-white border border-slate-200 rounded p-3">
              <span className="block text-[11px] font-semibold text-slate-500 uppercase">
                Mean Absolute Error (MAE)
              </span>
              <span className="font-heading text-lg font-bold text-slate-900 font-mono">
                {accuracy.overall_mae} pax
              </span>
            </div>

            <div className="bg-white border border-slate-200 rounded p-3">
              <span className="block text-[11px] font-semibold text-slate-500 uppercase">
                Mean Absolute % Error (MAPE)
              </span>
              <span className="font-heading text-lg font-bold text-slate-900 font-mono">
                {accuracy.overall_mape}%
              </span>
            </div>

            <div className="bg-white border border-slate-200 rounded p-3">
              <span className="block text-[11px] font-semibold text-slate-500 uppercase">
                Intervals Compared
              </span>
              <span className="font-heading text-lg font-bold text-slate-900 font-mono">
                {accuracy.intervals_compared} intervals
              </span>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
