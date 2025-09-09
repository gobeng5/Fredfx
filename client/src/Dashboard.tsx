import { useState, useEffect } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { Sidebar } from '@/components/Sidebar';
import { MarketOverview } from '@/components/MarketOverview';
import { LiveSignalsTable } from '@/components/LiveSignalsTable';
import { TechnicalIndicators } from '@/components/TechnicalIndicators';
import { TelegramBotPanel } from '@/components/TelegramBotPanel';
import { PerformanceMetrics } from '@/components/PerformanceMetrics';
import { SignalHistory } from '@/components/SignalHistory';
import { HighConfidenceSignals } from '@/components/HighConfidenceSignals';
import { BotConfiguration } from '@/components/BotConfiguration';
import { AdvancedAnalysis } from '@/components/AdvancedAnalysis';
import { ConsolidatedSignalsPanel } from '@/components/ConsolidatedSignalsPanel';
import { EnhancedFeaturesTab } from '@/components/EnhancedFeaturesTab';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, ChevronRight, Settings, BarChart3, TrendingUp, Minimize2, Clock } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

export default function Dashboard() {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isMarketOverviewExpanded, setIsMarketOverviewExpanded] = useState(true);
  const [isHeaderExpanded, setIsHeaderExpanded] = useState(true);
  const [timeUntilNext, setTimeUntilNext] = useState(0);
  const queryClient = useQueryClient();
  const { toast } = useToast();



  const executeAnalysisMutation = useMutation({
    mutationFn: () => apiRequest('POST', '/api/analysis/execute'),
    onMutate: () => {
      setIsAnalyzing(true);
    },
    onSuccess: async (response) => {
      const result = await response.json();
      toast({
        title: 'Analysis Complete',
        description: `Generated ${result.signalsGenerated} new signals`,
      });
      
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['/api/signals/active'] });
      queryClient.invalidateQueries({ queryKey: ['/api/signals/history'] });
    },
    onError: (error) => {
      toast({
        title: 'Analysis Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
    onSettled: () => {
      setIsAnalyzing(false);
    },
  });

  const handleExecuteAnalysis = () => {
    executeAnalysisMutation.mutate();
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString();
  };

  const formatCountdown = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  // Query to get the automated generator status
  const { data: automatedStatus } = useQuery({
    queryKey: ['/api/automated/status'],
    refetchInterval: 5000, // Update every 5 seconds
  });

  // Countdown timer effect
  useEffect(() => {
    if (!automatedStatus?.nextAnalysisTime) return;

    const updateCountdown = () => {
      const now = Date.now();
      const nextTime = new Date(automatedStatus.nextAnalysisTime).getTime();
      const timeLeft = Math.max(0, Math.floor((nextTime - now) / 1000));
      setTimeUntilNext(timeLeft);
    };

    // Update immediately
    updateCountdown();

    // Update every second
    const interval = setInterval(updateCountdown, 1000);

    return () => clearInterval(interval);
  }, [automatedStatus?.nextAnalysisTime]);

  return (
    <div className="min-h-screen flex bg-dark text-slate-50">
      <Sidebar />
      
      <div className="flex-1 flex flex-col">
        {/* Compact Header */}
        <Collapsible open={isHeaderExpanded} onOpenChange={setIsHeaderExpanded}>
          <CollapsibleTrigger asChild>
            <header className="bg-surface border-b border-slate-700 p-4 cursor-pointer hover:bg-slate-800/50 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  {isHeaderExpanded ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                  <div>
                    <h2 className="text-xl font-bold">Trading Dashboard</h2>
                    <p className="text-slate-400 text-sm">Real-time signals & analysis</p>
                  </div>
                </div>
                <div className="flex items-center space-x-4">
                  <div className="text-sm text-slate-400 flex items-center space-x-2">
                    <Clock className="h-4 w-4" />
                    <span>Next analysis: <span className="text-white font-mono">{formatCountdown(timeUntilNext)}</span></span>
                  </div>
                  <div className="text-sm text-slate-400">
                    <span className="text-white font-mono">{formatTime(new Date())}</span>
                  </div>
                  <Minimize2 className="h-4 w-4 text-slate-400" />
                </div>
              </div>
            </header>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="bg-surface border-b border-slate-700 px-4 pb-4">
              <div className="flex items-center justify-end">
                <button 
                  onClick={handleExecuteAnalysis}
                  disabled={isAnalyzing}
                  className="bg-primary hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-1.5 rounded text-sm font-medium transition-colors flex items-center space-x-2"
                >
                  {isAnalyzing ? (
                    <>
                      <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>
                      <span>Analyzing...</span>
                    </>
                  ) : (
                    <>
                      <TrendingUp className="h-3 w-3" />
                      <span>Execute Analysis</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Main Dashboard Content */}
        <main className="flex-1 p-4 overflow-auto space-y-3">
          {/* Market Overview - Collapsible */}
          <Collapsible open={isMarketOverviewExpanded} onOpenChange={setIsMarketOverviewExpanded}>
            <CollapsibleTrigger asChild>
              <div className="flex items-center justify-between p-3 bg-surface rounded-lg border border-slate-700 cursor-pointer hover:bg-slate-800/50 transition-colors">
                <div className="flex items-center space-x-3">
                  {isMarketOverviewExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  <BarChart3 className="h-4 w-4 text-blue-400" />
                  <span className="font-medium text-sm">Market Overview</span>
                </div>
                <div className="text-xs text-slate-400">Live prices & volatility</div>
              </div>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2">
              <div className="bg-surface rounded-lg border border-slate-700 p-4">
                <MarketOverview />
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Compact Tabbed Content */}
          <Tabs defaultValue="consolidated" className="bg-surface rounded-lg border border-slate-700">
            <TabsList className="grid w-full grid-cols-4 lg:grid-cols-8 bg-slate-800 border-b border-slate-700 rounded-b-none p-1">
              <TabsTrigger value="consolidated" className="data-[state=active]:bg-primary data-[state=active]:text-white text-xs py-1.5">
                Consolidated
              </TabsTrigger>
              <TabsTrigger value="enhanced" className="data-[state=active]:bg-primary data-[state=active]:text-white text-xs py-1.5">
                Enhanced
              </TabsTrigger>
              <TabsTrigger value="live-signals" className="data-[state=active]:bg-primary data-[state=active]:text-white text-xs py-1.5">
                Live Signals
              </TabsTrigger>
              <TabsTrigger value="high-confidence" className="data-[state=active]:bg-primary data-[state=active]:text-white text-xs py-1.5">
                High Confidence
              </TabsTrigger>
              <TabsTrigger value="advanced-analysis" className="data-[state=active]:bg-primary data-[state=active]:text-white text-xs py-1.5">
                Advanced
              </TabsTrigger>
              <TabsTrigger value="analysis" className="data-[state=active]:bg-primary data-[state=active]:text-white text-xs py-1.5">
                Analysis
              </TabsTrigger>
              <TabsTrigger value="configuration" className="data-[state=active]:bg-primary data-[state=active]:text-white text-xs py-1.5">
                <Settings className="h-3 w-3" />
              </TabsTrigger>
              <TabsTrigger value="history" className="data-[state=active]:bg-primary data-[state=active]:text-white text-xs py-1.5">
                History
              </TabsTrigger>
            </TabsList>

            <TabsContent value="consolidated" className="p-4">
              <ConsolidatedSignalsPanel />
            </TabsContent>

            <TabsContent value="enhanced" className="p-4">
              <EnhancedFeaturesTab />
            </TabsContent>

            <TabsContent value="live-signals" className="p-4">
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                <div className="xl:col-span-2">
                  <LiveSignalsTable />
                </div>
                <div>
                  <TechnicalIndicators />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="high-confidence" className="p-4">
              <HighConfidenceSignals />
            </TabsContent>



            <TabsContent value="advanced-analysis" className="p-4">
              <AdvancedAnalysis />
            </TabsContent>

            <TabsContent value="analysis" className="p-4">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <TelegramBotPanel />
                <PerformanceMetrics />
              </div>
            </TabsContent>

            <TabsContent value="configuration" className="p-4">
              <BotConfiguration />
            </TabsContent>

            <TabsContent value="history" className="p-4">
              <SignalHistory />
            </TabsContent>
          </Tabs>
        </main>
      </div>

      {/* Loading Overlay */}
      {isAnalyzing && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-surface rounded-xl p-8 max-w-sm mx-4 text-center border border-slate-700">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
            <h3 className="text-lg font-semibold mb-2">Analyzing Markets</h3>
            <p className="text-slate-400 text-sm">Generating signals for volatility indices...</p>
          </div>
        </div>
      )}
    </div>
  );
}
