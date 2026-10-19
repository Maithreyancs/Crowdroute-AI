import {
  AllocateRequest,
  AllocateResponse,
  ComplaintCreate,
  ComplaintPublicItem,
  ComplaintResponse,
  ForecastRequest,
  ForecastResponse,
  HealthResponse,
  HistoricalUploadResponse,
  LiveDataSummaryResponse,
  LiveWeatherResponse,
  ScenarioData,
  SimulateRequest,
  SimulateResponse,
  UserDataValidationResult,
} from '../types/api';

const API_BASE = '/api';

/**
 * Helper to handle HTTP errors cleanly and extract API detail messages.
 */
async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let errorDetail = `HTTP ${res.status}: ${res.statusText}`;
    try {
      const errJson = await res.json();
      if (errJson && errJson.detail) {
        errorDetail = typeof errJson.detail === 'string' ? errJson.detail : JSON.stringify(errJson.detail);
      }
    } catch {
      // Ignore JSON parse error and use statusText
    }
    throw new Error(errorDetail);
  }
  return res.json();
}

export const api = {
  /**
   * Health & System Info
   */
  async getHealth(): Promise<HealthResponse> {
    const res = await fetch(`${API_BASE}/health`);
    return handleResponse<HealthResponse>(res);
  },

  /**
   * Baseline Scenario Data
   */
  async getScenario(): Promise<ScenarioData> {
    const res = await fetch(`${API_BASE}/scenario`);
    return handleResponse<ScenarioData>(res);
  },

  /**
   * Validate Scenario Parameters
   */
  async validateScenario(scenario: ScenarioData): Promise<UserDataValidationResult> {
    const res = await fetch(`${API_BASE}/validate/scenario`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(scenario),
    });
    return handleResponse<UserDataValidationResult>(res);
  },

  /**
   * Live External Feed Status Report
   */
  async getLiveStatus(): Promise<LiveDataSummaryResponse> {
    const res = await fetch(`${API_BASE}/live/status`);
    return handleResponse<LiveDataSummaryResponse>(res);
  },

  /**
   * Fetch live Open-Meteo meteorological observation for Tiruvannamalai
   */
  async getLiveWeather(forceRefresh: boolean = false): Promise<LiveWeatherResponse> {
    const url = forceRefresh ? `${API_BASE}/weather/live?force_refresh=true` : `${API_BASE}/weather/live`;
    const res = await fetch(url);
    return handleResponse<LiveWeatherResponse>(res);
  },

  /**
   * Ingest and validate historical passenger CSV / Excel file
   */
  async uploadHistoricalFile(
    file: File,
    customMapping?: Record<string, string>
  ): Promise<HistoricalUploadResponse> {
    const formData = new FormData();
    formData.append('file', file);
    if (customMapping) {
      formData.append('column_mapping', JSON.stringify(customMapping));
    }

    const res = await fetch(`${API_BASE}/historical/upload`, {
      method: 'POST',
      body: formData,
    });
    return handleResponse<HistoricalUploadResponse>(res);
  },

  /**
   * Fetch sample historical CSV text
   */
  async getSampleHistoricalCsvBlob(): Promise<Blob> {
    const res = await fetch(`${API_BASE}/historical/sample`);
    if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to download sample CSV`);
    return res.blob();
  },

  /**
   * Fetch sample historical Excel (.xlsx) file
   */
  async getSampleHistoricalExcelBlob(): Promise<Blob> {
    const res = await fetch(`${API_BASE}/historical/sample.xlsx`);
    if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to download sample Excel spreadsheet`);
    return res.blob();
  },

  /**
   * Dynamic crowd passenger forecast
   */
  async postForecast(request: ForecastRequest): Promise<ForecastResponse> {
    const res = await fetch(`${API_BASE}/forecast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
    return handleResponse<ForecastResponse>(res);
  },

  /**
   * Fixed-fleet constrained bus reallocation
   */
  async postAllocate(request: AllocateRequest): Promise<AllocateResponse> {
    const res = await fetch(`${API_BASE}/allocate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
    return handleResponse<AllocateResponse>(res);
  },

  /**
   * Comparative interval simulation (baseline vs proposed)
   */
  async postSimulate(request: SimulateRequest): Promise<SimulateResponse> {
    const res = await fetch(`${API_BASE}/simulate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
    return handleResponse<SimulateResponse>(res);
  },

  /**
   * Submit a citizen transport issue/complaint
   */
  async submitComplaint(data: ComplaintCreate): Promise<ComplaintResponse> {
    const res = await fetch(`${API_BASE}/complaints`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse<ComplaintResponse>(res);
  },

  /**
   * Retrieve recent public complaints (privacy protected)
   */
  async getPublicComplaints(): Promise<ComplaintPublicItem[]> {
    const res = await fetch(`${API_BASE}/complaints`);
    return handleResponse<ComplaintPublicItem[]>(res);
  },

  /**
   * Track complaint by reference ID
   */
  async trackComplaint(referenceId: string): Promise<ComplaintResponse> {
    const res = await fetch(`${API_BASE}/complaints/${encodeURIComponent(referenceId)}`);
    return handleResponse<ComplaintResponse>(res);
  },
};
