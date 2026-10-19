import React, { useState, useEffect, useCallback, useRef } from 'react';
import { api } from './services/api';
import {
  AllocateResponse,
  ForecastResponse,
  HistoricalRecord,
  HistoricalUploadResponse,
  LiveDataSummaryResponse,
  LiveWeatherResponse,
  OperationalMode,
  ScenarioData,
  SimulateResponse,
} from './types/api';
import { Header, NavItem } from './components/Header';
import { Footer } from './components/Footer';
import { HomePage } from './pages/HomePage';
import { DashboardPage } from './pages/DashboardPage';
import { DataSourcesPage } from './pages/DataSourcesPage';
import { ComplaintSection } from './components/ComplaintSection';
import { ActivityLogEntry } from './components/LiveFestivalUpdates';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ReportProblemModal, TrackReportModal } from './components/CivicModals';
import { AlertCircle } from 'lucide-react';
import { formatTo12Hour } from './utils/timeFormat';

const getFormattedNow = () =>
  new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true });

const getNavFromUrl = (): NavItem => {
  if (typeof window === 'undefined') return 'home';
  const pathname = window.location.pathname.toLowerCase();
  const searchParams = new URLSearchParams(window.location.search);
  const tab = searchParams.get('tab')?.toLowerCase() || '';
  const hash = window.location.hash.toLowerCase();

  if (pathname.startsWith('/sources') || tab === 'sources' || hash.includes('sources')) return 'sources';
  if (pathname.startsWith('/simulation') || tab === 'simulation' || hash.includes('simulation')) return 'simulation';
  if (pathname.startsWith('/historical') || tab === 'historical' || hash.includes('historical')) return 'historical';
  if (pathname.startsWith('/bus-map') || pathname.startsWith('/map') || tab === 'map' || tab === 'map-timetable' || hash.includes('bus-map-section')) return 'bus-map';
  if (pathname.startsWith('/crowd-prediction') || pathname.startsWith('/prediction') || tab === 'scenario' || tab === 'results' || hash.includes('crowd-forecast') || hash.includes('crowd-prediction-section') || hash.includes('scenario-control')) return 'prediction';
  if (pathname.startsWith('/timetable') || tab === 'timetable' || hash.includes('bus-timetable-section')) return 'timetable';
  if (pathname.startsWith('/bus-planning') || pathname.startsWith('/planning') || tab === 'optimization' || hash.includes('bus-allocation')) return 'planning';
  return 'home';
};

const getPageFromUrl = (): 'home' | 'dashboard' | 'complaints' | 'sources' => {
  if (typeof window === 'undefined') return 'home';
  const pathname = window.location.pathname.toLowerCase();
  const hash = window.location.hash.toLowerCase();
  if (pathname.startsWith('/dashboard') || hash.includes('dashboard')) return 'dashboard';
  if (pathname.startsWith('/simulation') || pathname.startsWith('/historical')) return 'dashboard';
  if (pathname.startsWith('/complaints') || hash.includes('complaints')) return 'complaints';
  if (pathname.startsWith('/sources') || hash.includes('sources')) return 'sources';
  return 'home';
};

const getTabFromUrl = (): string => {
  if (typeof window === 'undefined') return 'all';
  const pathname = window.location.pathname.toLowerCase();
  if (pathname.startsWith('/simulation')) return 'optimization';
  if (pathname.startsWith('/historical')) return 'sources';
  const searchParams = new URLSearchParams(window.location.search);
  const tabParam = searchParams.get('tab');
  if (tabParam) return tabParam;
  const hash = window.location.hash.toLowerCase();
  if (hash.includes('tab=')) {
    const match = hash.match(/tab=([a-z-]+)/);
    if (match) return match[1];
  }
  return 'all';
};

export const App: React.FC = () => {
  const [activeNav, setActiveNav] = useState<NavItem>(getNavFromUrl());
  const [activePage, setActivePage] = useState<'home' | 'dashboard' | 'complaints' | 'sources'>(getPageFromUrl());
  const [dashboardTab, setDashboardTab] = useState<string>(getTabFromUrl());
  const [systemMode, setSystemMode] = useState<OperationalMode>('DEMO_SYNTHETIC');
  const [hasRunInitialPrediction, setHasRunInitialPrediction] = useState<boolean>(true);

  // Civic Modals States (Matching WaterlogAI quick action dialogs)
  const [isReportModalOpen, setIsReportModalOpen] = useState<boolean>(false);
  const [isTrackModalOpen, setIsTrackModalOpen] = useState<boolean>(false);

  // Request sequencing reference to prevent stale responses from overwriting newer scenarios
  const latestRequestIdRef = useRef<number>(0);

  // Application Data States
  const [scenario, setScenario] = useState<ScenarioData | null>(null);
  const [forecast, setForecast] = useState<ForecastResponse | null>(null);
  const [allocation, setAllocation] = useState<AllocateResponse | null>(null);
  const [simulation, setSimulation] = useState<SimulateResponse | null>(null);
  const [uploadResult, setUploadResult] = useState<HistoricalUploadResponse | null>(null);
  const [historicalRecords, setHistoricalRecords] = useState<HistoricalRecord[] | null>(null);
  const [liveStatus, setLiveStatus] = useState<LiveDataSummaryResponse | null>(null);

  // Live constraint monitoring state
  const [isUpdating, setIsUpdating] = useState<boolean>(false);
  const [lastUpdateTimestamp, setLastUpdateTimestamp] = useState<string>(getFormattedNow());
  const [activityLog, setActivityLog] = useState<ActivityLogEntry[]>([
    {
      id: 'init-0',
      timestamp: getFormattedNow(),
      action: 'System Initialized',
      details: 'Loaded baseline festival schedule (9:30 PM finish, Clear weather). Fixed fleet: 16 buses.',
      type: 'system',
    },
  ]);

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Live Ground Telemetry States (Open-Meteo & Festival Corridor)
  const [liveWeather, setLiveWeather] = useState<LiveWeatherResponse | null>(null);
  const [weatherError, setWeatherError] = useState<string | null>(null);
  const [isRefreshingTelemetry, setIsRefreshingTelemetry] = useState<boolean>(false);
  const [lastSuccessfulTelemetryTime, setLastSuccessfulTelemetryTime] = useState<string | null>(null);
  const [isManualWeatherOverride, setIsManualWeatherOverride] = useState<boolean>(false);

  /**
   * Run complete 3-stage pipeline (Forecast -> Allocate -> Simulate)
   * Enforces asynchronous sequencing: older slow responses cannot overwrite newer state.
   */
  const executeAnalysis = useCallback(
    async (
      currentScenario: ScenarioData,
      mode: OperationalMode,
      histRecords: HistoricalRecord[] | null
    ) => {
      const currentReqId = ++latestRequestIdRef.current;
      setIsLoading(true);
      setIsUpdating(true);
      setErrorMessage(null);

      try {
        // 1. Forecast Request
        const fcRes = await api.postForecast({
          scenario: currentScenario,
          operational_mode: mode,
          historical_records: histRecords,
        });
        if (currentReqId !== latestRequestIdRef.current) return;
        setForecast(fcRes);

        // 2. Allocate Request
        const allocRes = await api.postAllocate({
          scenario: currentScenario,
          forecast: fcRes,
          max_moves: 10,
        });
        if (currentReqId !== latestRequestIdRef.current) return;
        setAllocation(allocRes);

        // 3. Simulate Request
        const simRes = await api.postSimulate({
          scenario: currentScenario,
          moves_override: allocRes.recommended_moves,
        });
        if (currentReqId !== latestRequestIdRef.current) return;
        setSimulation(simRes);

        setLastUpdateTimestamp(getFormattedNow());
      } catch (err: any) {
        if (currentReqId !== latestRequestIdRef.current) return;
        console.error('Analysis execution error:', err);
        setErrorMessage(err.message || 'Failed to execute analysis.');
      } finally {
        if (currentReqId === latestRequestIdRef.current) {
          setIsLoading(false);
          setIsUpdating(false);
        }
      }
    },
    []
  );

  /**
   * Initial Load
   */
  useEffect(() => {
    const initialize = async () => {
      try {
        setIsLoading(true);
        // Load default scenario
        const sc = await api.getScenario();
        setScenario(sc);

        // Fetch live status
        try {
          const live = await api.getLiveStatus();
          setLiveStatus(live);
        } catch (e) {
          console.warn('Could not load live status:', e);
        }

        // Fetch initial live weather telemetry
        try {
          const wRes = await api.getLiveWeather(false);
          setLiveWeather(wRes);
          if (wRes.status === 'UNAVAILABLE') {
            setWeatherError(wRes.message || 'Open-Meteo telemetry currently unavailable');
          } else {
            setWeatherError(null);
            setLastSuccessfulTelemetryTime(wRes.last_updated || getFormattedNow());
          }
        } catch (wErr: any) {
          console.warn('Initial live weather check warning:', wErr);
          setWeatherError(wErr.message || 'Telemetry provider offline');
        }

        // Run baseline analysis
        await executeAnalysis(sc, 'DEMO_SYNTHETIC', null);
      } catch (err: any) {
        console.error('Initialization failed:', err);
        setErrorMessage(err.message || 'Failed to initialize portal.');
      } finally {
        setIsLoading(false);
      }
    };

    initialize();
  }, [executeAnalysis]);

  /**
   * Mode Change
   */
  const handleSetMode = (mode: OperationalMode) => {
    setSystemMode(mode);
    if (scenario) {
      executeAnalysis(scenario, mode, historicalRecords);
    }
  };

  /**
   * Reset Defaults
   */
  const handleResetDefaults = async () => {
    try {
      setIsLoading(true);
      const sc = await api.getScenario();
      setScenario(sc);
      setHistoricalRecords(null);
      setUploadResult(null);
      setSystemMode('DEMO_SYNTHETIC');
      setIsManualWeatherOverride(false);
      setWeatherError(null);
      const resetEntry: ActivityLogEntry = {
        id: `${Date.now()}-reset`,
        timestamp: getFormattedNow(),
        action: 'Reset to Scenario Defaults',
        details: 'Restored baseline 9:30 PM event conclusion and Clear weather.',
        type: 'reset',
      };
      setActivityLog((prev) => [resetEntry, ...prev.slice(0, 24)]);
      await executeAnalysis(sc, 'DEMO_SYNTHETIC', null);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to reset scenario.');
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Live Operational Changes (Weather, Event Delays, Quick Actions)
   * Reacts automatically without manual re-runs.
   */
  const handleLiveScenarioUpdate = (updatedScenario: ScenarioData, description: string) => {
    if (description.toLowerCase().includes('weather')) {
      setIsManualWeatherOverride(true);
    }
    setScenario(updatedScenario);
    const newEntry: ActivityLogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: getFormattedNow(),
      action: description,
      details: `Scenario updated (End time: ${formatTo12Hour(updatedScenario.festival_programme.scheduled_event_end_time)}, Weather: ${updatedScenario.weather.condition}). Auto-recalculating pipeline.`,
      type: description.toLowerCase().includes('weather')
        ? 'weather'
        : description.toLowerCase().includes('delay')
        ? 'delay'
        : 'system',
    };
    setActivityLog((prev) => [newEntry, ...prev.slice(0, 24)]);
    executeAnalysis(updatedScenario, systemMode, historicalRecords);
  };

  /**
   * Dedicated Refresh handler for Festival Corridor Telemetry.
   * Requests real ground observation from Open-Meteo with force_refresh=true.
   * Synchronizes scenario weather when not in manual override and re-runs downstream analysis.
   * Prevents concurrent click duplication and preserves timestamps truthfully.
   */
  const handleRefreshTelemetry = async () => {
    if (isRefreshingTelemetry || isLoading || isUpdating) {
      return;
    }

    setIsRefreshingTelemetry(true);
    setIsUpdating(true);
    setErrorMessage(null);

    try {
      const weatherRes = await api.getLiveWeather(true);
      setLiveWeather(weatherRes);

      if (weatherRes.status === 'UNAVAILABLE') {
        setWeatherError(weatherRes.message || 'Open-Meteo meteorological feed returned unavailable.');
        // Do not advance lastSuccessfulTelemetryTime on failure!
        if (scenario) {
          await executeAnalysis(scenario, systemMode, historicalRecords);
        }
      } else {
        setWeatherError(null);
        setLastSuccessfulTelemetryTime(weatherRes.last_updated || getFormattedNow());

        let targetScenario = scenario;
        if (!isManualWeatherOverride && scenario && weatherRes.condition) {
          if (scenario.weather.condition !== weatherRes.condition) {
            targetScenario = {
              ...scenario,
              weather: {
                ...scenario.weather,
                condition: weatherRes.condition,
              },
            };
            setScenario(targetScenario);
          }
        }

        const logEntry: ActivityLogEntry = {
          id: `${Date.now()}-telemetry`,
          timestamp: getFormattedNow(),
          action: 'Festival Corridor Telemetry Refreshed',
          details: `Ground observation: ${weatherRes.condition_description} (${weatherRes.temperature_c ?? '--'}°C, ${weatherRes.rain_mm ?? weatherRes.precipitation_mm ?? 0} mm rain). Status: ${weatherRes.status}.`,
          type: 'weather',
        };
        setActivityLog((prev) => [logEntry, ...prev.slice(0, 24)]);

        if (targetScenario) {
          await executeAnalysis(targetScenario, systemMode, historicalRecords);
        }
      }
    } catch (err: any) {
      console.error('Telemetry refresh error:', err);
      setWeatherError(err.message || 'Failed to connect to Open-Meteo meteorological feed.');
    } finally {
      setIsRefreshingTelemetry(false);
      setIsUpdating(false);
    }
  };

  /**
   * Refresh Analysis
   */
  const handleRefresh = () => {
    handleRefreshTelemetry();
  };

  /**
   * Apply Scenario Form Edits
   */
  const handleApplyScenario = (updated: ScenarioData) => {
    handleLiveScenarioUpdate(updated, 'Manual Scenario Form Configuration Saved');
  };

  /**
   * File Upload
   */
  const handleUploadFile = async (file: File): Promise<HistoricalUploadResponse> => {
    setIsLoading(true);
    try {
      const res = await api.uploadHistoricalFile(file);
      setUploadResult(res);
      if (res.status !== 'INVALID_FILE' && res.records.length > 0) {
        setHistoricalRecords(res.records);
        // Switch to User Data Mode automatically
        setSystemMode('USER_DATA');
        if (scenario) {
          await executeAnalysis(scenario, 'USER_DATA', res.records);
        }
      }
      return res;
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Load Sample Historical CSV
   */
  const handleLoadSampleCsv = async () => {
    try {
      setIsLoading(true);
      const blob = await api.getSampleHistoricalCsvBlob();
      const file = new File([blob], 'sample_festival_historical_data.csv', { type: 'text/csv' });
      await handleUploadFile(file);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to load sample historical CSV.');
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Refresh Live Feed
   */
  const handleRefreshLive = async () => {
    try {
      const live = await api.getLiveStatus();
      setLiveStatus(live);
    } catch (err: any) {
      console.warn('Live status refresh error:', err);
    }
  };

  const scrollToSection = useCallback((sectionId: string) => {
    setTimeout(() => {
      const el = document.getElementById(sectionId);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth' });
      }
    }, 80);
  }, []);

  /**
   * Browser URL synchronized navigation
   */
  const navigateTo = useCallback(
    (page: 'home' | 'dashboard' | 'complaints' | 'sources', tab?: string, nav?: NavItem) => {
      setActivePage(page);
      if (tab) setDashboardTab(tab);
      if (nav) setActiveNav(nav);

      const targetTab = tab || (page === 'dashboard' ? dashboardTab : undefined);
      let targetPath = '/';
      if (page === 'dashboard') {
        if (nav === 'simulation') {
          targetPath = '/simulation';
        } else if (nav === 'historical') {
          targetPath = '/historical';
        } else {
          targetPath = targetTab && targetTab !== 'all' ? `/dashboard?tab=${targetTab}` : '/dashboard';
        }
      } else if (page === 'complaints') {
        targetPath = '/complaints';
      } else if (page === 'sources') {
        targetPath = '/sources';
      } else if (page === 'home') {
        if (nav === 'bus-map') targetPath = '/bus-map';
        else if (nav === 'prediction') targetPath = '/crowd-prediction';
        else if (nav === 'timetable') targetPath = '/timetable';
        else if (nav === 'planning') targetPath = '/bus-planning';
        else targetPath = '/';
      }

      if (window.location.pathname + window.location.search !== targetPath) {
        try {
          window.history.pushState({ page, tab: targetTab, nav }, '', targetPath);
        } catch (e) {
          window.location.hash = targetPath;
        }
      }
    },
    [dashboardTab]
  );

  const handleNavigateNav = useCallback(
    (item: NavItem) => {
      setActiveNav(item);
      switch (item) {
        case 'home':
          navigateTo('home', undefined, 'home');
          window.scrollTo({ top: 0, behavior: 'smooth' });
          break;
        case 'bus-map':
          navigateTo('home', undefined, 'bus-map');
          scrollToSection('bus-map-section');
          break;
        case 'prediction':
          navigateTo('home', undefined, 'prediction');
          scrollToSection('crowd-prediction-section');
          break;
        case 'timetable':
          navigateTo('home', undefined, 'timetable');
          scrollToSection('bus-timetable-section');
          break;
        case 'planning':
          navigateTo('home', undefined, 'planning');
          scrollToSection('bus-allocation');
          break;
        case 'simulation':
          navigateTo('dashboard', 'optimization', 'simulation');
          window.scrollTo({ top: 0, behavior: 'smooth' });
          break;
        case 'historical':
          navigateTo('dashboard', 'sources', 'historical');
          window.scrollTo({ top: 0, behavior: 'smooth' });
          break;
        case 'sources':
          navigateTo('sources', undefined, 'sources');
          window.scrollTo({ top: 0, behavior: 'smooth' });
          break;
      }
    },
    [navigateTo, scrollToSection]
  );

  // Synchronize on browser Back/Forward or direct hash/path changes
  useEffect(() => {
    const handleUrlChange = () => {
      const page = getPageFromUrl();
      const tab = getTabFromUrl();
      const nav = getNavFromUrl();
      setActivePage(page);
      setDashboardTab(tab);
      setActiveNav(nav);

      if (page === 'home') {
        if (nav === 'bus-map') scrollToSection('bus-map-section');
        else if (nav === 'prediction') scrollToSection('crowd-prediction-section');
        else if (nav === 'timetable') scrollToSection('bus-timetable-section');
        else if (nav === 'planning') scrollToSection('bus-allocation');
      }
    };
    window.addEventListener('popstate', handleUrlChange);
    window.addEventListener('hashchange', handleUrlChange);
    // Initial check on load
    handleUrlChange();
    return () => {
      window.removeEventListener('popstate', handleUrlChange);
      window.removeEventListener('hashchange', handleUrlChange);
    };
  }, [scrollToSection]);

  const handleNavigateDashboard = (tab?: string) => {
    navigateTo('dashboard', tab);
  };

  /**
   * Run Prediction Action from Festival Scenario Control Center
   */
  const handleRunPrediction = (updatedScenario: ScenarioData) => {
    setScenario(updatedScenario);
    setHasRunInitialPrediction(true);
    const newEntry: ActivityLogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: getFormattedNow(),
      action: 'Prediction Pipeline Executed',
      details: `Forecast & fleet relocation calculated for "${updatedScenario.festival_programme.event_name}" (${updatedScenario.festival_programme.expected_total_attendance.toLocaleString()} attendees, ${updatedScenario.weather.condition}).`,
      type: 'system',
    };
    setActivityLog((prev) => [newEntry, ...prev.slice(0, 24)]);
    executeAnalysis(updatedScenario, systemMode, historicalRecords);
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 font-sans">
      
      {/* 1. HEADER (ACTIVE BLUE NAVBAR) */}
      <Header
        activePage={activePage}
        setActivePage={navigateTo}
        activeNav={activeNav}
        onNavigateNav={handleNavigateNav}
        systemMode={systemMode}
        onOpenReportModal={() => setIsReportModalOpen(true)}
        onOpenTrackModal={() => setIsTrackModalOpen(true)}
        onNavigateSection={(sectionId) => scrollToSection(sectionId)}
      />

      {/* ERROR BANNER IF ANY */}
      {errorMessage && (
        <div className="bg-red-50 border-b border-red-200 text-red-800 px-4 py-2.5 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button
            onClick={() => setErrorMessage(null)}
            className="text-red-700 hover:text-red-900 font-bold ml-4"
          >
            ✕
          </button>
        </div>
      )}

      {/* 2. MAIN CONTENT VIEW PROTECTED BY ERROR BOUNDARY */}
      <main className="flex-1">
        <ErrorBoundary fallbackTitle="Portal View Recovery" onReset={handleResetDefaults}>
          {activePage === 'home' ? (
            <HomePage
              scenario={scenario}
              forecast={forecast}
              allocation={allocation}
              systemMode={systemMode}
              onSetMode={handleSetMode}
              onResetDefaults={handleResetDefaults}
              onRefresh={handleRefresh}
              onNavigateDashboard={handleNavigateDashboard}
              onNavigateComplaints={() => {
                navigateTo('complaints');
              }}
              onLiveScenarioUpdate={handleLiveScenarioUpdate}
              onRunPrediction={handleRunPrediction}
              isUpdating={isUpdating || isRefreshingTelemetry}
              activityLog={activityLog}
              lastUpdateTimestamp={lastUpdateTimestamp}
              lastSuccessfulTelemetryTime={lastSuccessfulTelemetryTime}
              isLoading={isLoading}
              hasRunInitialPrediction={hasRunInitialPrediction}
              liveWeather={liveWeather}
              weatherError={weatherError}
              errorMessage={errorMessage}
              isManualWeatherOverride={isManualWeatherOverride}
            />
          ) : activePage === 'complaints' ? (
            <div className="py-6">
              <ComplaintSection stops={scenario?.stops || []} />
            </div>
          ) : activePage === 'sources' ? (
            <DataSourcesPage
              scenario={scenario}
              liveStatus={liveStatus}
              uploadResult={uploadResult}
              onRefreshLive={handleRefreshLive}
              onBackToHome={() => {
                navigateTo('home');
              }}
              onNavigatePastData={() => {
                handleNavigateDashboard('historical');
              }}
              isLoading={isLoading}
            />
          ) : (
            <DashboardPage
              initialTab={dashboardTab}
              scenario={scenario}
              forecast={forecast}
              allocation={allocation}
              simulation={simulation}
              uploadResult={uploadResult}
              liveStatus={liveStatus}
              onApplyScenario={handleRunPrediction}
              onReloadScenario={handleResetDefaults}
              onUploadFile={handleUploadFile}
              onLoadSampleCsv={handleLoadSampleCsv}
              onRefreshLive={handleRefreshLive}
              onBackToHome={() => {
                navigateTo('home');
              }}
              isLoading={isLoading}
              isUpdating={isUpdating}
              lastUpdateTimestamp={lastUpdateTimestamp}
              hasRunInitialPrediction={hasRunInitialPrediction}
            />
          )}
        </ErrorBoundary>
      </main>


      {/* 3. FOOTER */}
      <Footer />

      {/* 4. CIVIC ACTION MODALS (MATCHING WATERLOGAI SCREENSHOTS 4 & 5) */}
      <ReportProblemModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        stops={scenario?.stops || []}
      />
      <TrackReportModal
        isOpen={isTrackModalOpen}
        onClose={() => setIsTrackModalOpen(false)}
      />
    </div>
  );
};

export default App;
