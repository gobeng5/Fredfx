import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  TestTube, 
  Play, 
  TrendingUp, 
  TrendingDown, 
  Shield, 
  AlertTriangle,
  Target,
  DollarSign,
  Activity,
  CheckCircle,
  XCircle
} from 'lucide-react';

interface Signal {
  id: number;
  symbol: string;
  signalType: 'BUY' | 'SELL';
  entryPrice: string;
  confidence: number;
  timestamp: string;
}

interface ProtectionRecommendation {
  shouldProtect: boolean;
  recommendedStopLoss: number;
  profitTier: 'NONE' | 'SMALL' | 'MEDIUM' | 'LARGE' | 'HUGE';
  protectionPercent: number;
  currentProfitPercent: number;
  peakProfitPercent: number;
  drawdownFromPeak: number;
  reason: string;
  alertMessage: string;
}

const TestTacticalAssistant = () => {
  const queryClient = useQueryClient();
  const [selectedSignal, setSelectedSignal] = useState<number | null>(null);
  const [testScenario, setTestScenario] = useState('normal');

  // Fetch active signals to test with
  const { data: activeSignals = [] } = useQuery<Signal[]>({
    queryKey: ['/api/consolidated/active'],
    refetchInterval: 5000,
  });

  // Fetch tactical status
  const { data: tacticalStatus } = useQuery({
    queryKey: ['/api/tactical/status'],
    refetchInterval: 3000,
  });

  // Fetch recent alerts
  const { data: recentAlerts = [] } = useQuery({
    queryKey: ['/api/tactical/alerts'],
    refetchInterval: 2000,
  });

  // Test profit protection for a specific signal
  const { data: protectionData, isLoading: isTestingProtection } = useQuery<{
    signalId: number;
    symbol: string;
    currentPrice: number;
    entryPrice: number;
  } & ProtectionRecommendation>({
    queryKey: ['/api/tactical/profit-protection', selectedSignal],
    enabled: !!selectedSignal,
    refetchInterval: 1000, // Real-time updates during testing
  });

  const getProfitTierColor = (tier: string) => {
    switch (tier) {
      case 'HUGE': return 'bg-purple-500';
      case 'LARGE': return 'bg-blue-500';
      case 'MEDIUM': return 'bg-green-500';
      case 'SMALL': return 'bg-yellow-500';
      default: return 'bg-gray-500';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'STRONG': return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'WEAKENING': return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
      case 'CRITICAL': return <XCircle className="w-4 h-4 text-red-500" />;
      default: return <Activity className="w-4 h-4 text-gray-500" />;
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          Tactical Assistant Test Center
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2">
          Test the enhanced profit protection and signal monitoring features
        </p>
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">System Overview</TabsTrigger>
          <TabsTrigger value="signals">Test Signals</TabsTrigger>
          <TabsTrigger value="protection">Profit Protection</TabsTrigger>
          <TabsTrigger value="scenarios">Test Scenarios</TabsTrigger>
        </TabsList>

        {/* System Overview */}
        <TabsContent value="overview">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">System Status</CardTitle>
                <Activity className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {tacticalStatus?.isRunning ? 'Active' : 'Inactive'}
                </div>
                <div className="flex items-center space-x-2 mt-2">
                  <div className={`w-2 h-2 rounded-full ${tacticalStatus?.isRunning ? 'bg-green-500' : 'bg-red-500'}`} />
                  <p className="text-xs text-muted-foreground">
                    {tacticalStatus?.totalMonitored || 0} signals monitored
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Active Signals</CardTitle>
                <Target className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{activeSignals.length}</div>
                <p className="text-xs text-muted-foreground">
                  Available for testing
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Recent Alerts</CardTitle>
                <Shield className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{recentAlerts.length}</div>
                <p className="text-xs text-muted-foreground">
                  Tactical recommendations
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Recent Alerts Display */}
          <Card>
            <CardHeader>
              <CardTitle>Live Tactical Alerts</CardTitle>
              <CardDescription>
                Real-time profit protection and signal health alerts
              </CardDescription>
            </CardHeader>
            <CardContent>
              {recentAlerts.length === 0 ? (
                <Alert>
                  <Activity className="h-4 w-4" />
                  <AlertDescription>
                    No recent alerts. System is monitoring signals for profit protection opportunities.
                  </AlertDescription>
                </Alert>
              ) : (
                <div className="space-y-3">
                  {recentAlerts.slice(0, 5).map((alert: any, index: number) => (
                    <div key={`alert-${index}-${alert.timestamp || Date.now()}`} 
                         className="p-3 border rounded-lg">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          {getStatusIcon(alert.type)}
                          <span className="font-medium">{alert.symbol}</span>
                          <Badge variant="outline">{alert.type}</Badge>
                        </div>
                        <span className="text-sm text-muted-foreground">
                          {new Date(alert.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                      <p className="text-sm mt-2">{alert.message}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Test Signals */}
        <TabsContent value="signals">
          <Card>
            <CardHeader>
              <CardTitle>Available Test Signals</CardTitle>
              <CardDescription>
                Select a signal to test profit protection features
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {activeSignals.map((signal) => (
                  <Card key={signal.id} 
                        className={`cursor-pointer transition-colors ${
                          selectedSignal === signal.id 
                            ? 'ring-2 ring-blue-500' 
                            : 'hover:bg-muted/50'
                        }`}
                        onClick={() => setSelectedSignal(signal.id)}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="font-semibold">{signal.symbol}</h3>
                        <Badge variant={signal.signalType === 'BUY' ? 'default' : 'destructive'}>
                          {signal.signalType}
                        </Badge>
                      </div>
                      <div className="space-y-1 text-sm text-muted-foreground">
                        <div>Entry: {parseFloat(signal.entryPrice).toFixed(4)}</div>
                        <div>Confidence: {signal.confidence}%</div>
                        <div>Age: {Math.round((Date.now() - new Date(signal.timestamp).getTime()) / (1000 * 60))}min</div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
              
              {activeSignals.length === 0 && (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    No active signals available. Generate a signal first using the "Execute Analysis" button on the main dashboard.
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Profit Protection Testing */}
        <TabsContent value="protection">
          <div className="space-y-6">
            {selectedSignal ? (
              <Card>
                <CardHeader>
                  <CardTitle>Profit Protection Analysis</CardTitle>
                  <CardDescription>
                    Real-time profit protection analysis for Signal #{selectedSignal}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {isTestingProtection ? (
                    <div className="flex items-center space-x-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
                      <span>Analyzing profit protection...</span>
                    </div>
                  ) : protectionData ? (
                    <div className="space-y-4">
                      {/* Current Status */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="text-center">
                          <div className="text-2xl font-bold text-green-600">
                            {protectionData.currentProfitPercent.toFixed(2)}%
                          </div>
                          <div className="text-sm text-muted-foreground">Current Profit</div>
                        </div>
                        <div className="text-center">
                          <div className="text-2xl font-bold text-blue-600">
                            {protectionData.peakProfitPercent.toFixed(2)}%
                          </div>
                          <div className="text-sm text-muted-foreground">Peak Profit</div>
                        </div>
                        <div className="text-center">
                          <div className="text-2xl font-bold">
                            {protectionData.currentPrice.toFixed(4)}
                          </div>
                          <div className="text-sm text-muted-foreground">Current Price</div>
                        </div>
                        <div className="text-center">
                          <div className="text-2xl font-bold">
                            {protectionData.entryPrice.toFixed(4)}
                          </div>
                          <div className="text-sm text-muted-foreground">Entry Price</div>
                        </div>
                      </div>

                      {/* Profit Tier */}
                      <div className="flex items-center space-x-4">
                        <Badge className={getProfitTierColor(protectionData.profitTier)}>
                          {protectionData.profitTier} PROFITS
                        </Badge>
                        <span className="text-sm">
                          Protection Level: {protectionData.protectionPercent}%
                        </span>
                      </div>

                      {/* Drawdown Analysis */}
                      {protectionData.drawdownFromPeak > 0 && (
                        <div className="bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded-lg">
                          <div className="flex items-center space-x-2 mb-2">
                            <TrendingDown className="w-4 h-4 text-yellow-600" />
                            <span className="font-medium text-yellow-800 dark:text-yellow-200">
                              Drawdown Alert
                            </span>
                          </div>
                          <p className="text-sm text-yellow-700 dark:text-yellow-300">
                            {protectionData.drawdownFromPeak.toFixed(2)}% drop from peak profit
                          </p>
                        </div>
                      )}

                      {/* Protection Recommendation */}
                      {protectionData.shouldProtect ? (
                        <Alert>
                          <Shield className="h-4 w-4" />
                          <AlertDescription>
                            <div className="space-y-2">
                              <div className="font-medium">Protection Recommended</div>
                              <div>{protectionData.alertMessage}</div>
                              <div className="text-sm">
                                Suggested Stop Loss: <strong>{protectionData.recommendedStopLoss.toFixed(4)}</strong>
                              </div>
                              <div className="text-sm text-muted-foreground">
                                Reason: {protectionData.reason}
                              </div>
                            </div>
                          </AlertDescription>
                        </Alert>
                      ) : (
                        <Alert>
                          <CheckCircle className="h-4 w-4" />
                          <AlertDescription>
                            Signal is healthy. No immediate protection action required.
                          </AlertDescription>
                        </Alert>
                      )}
                    </div>
                  ) : (
                    <Alert>
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription>
                        Failed to load profit protection data. Please try again.
                      </AlertDescription>
                    </Alert>
                  )}
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-8 text-center">
                  <TestTube className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-lg font-medium mb-2">Select a Signal to Test</h3>
                  <p className="text-muted-foreground">
                    Choose a signal from the "Test Signals" tab to analyze its profit protection status.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* Test Scenarios */}
        <TabsContent value="scenarios">
          <Card>
            <CardHeader>
              <CardTitle>Testing Scenarios</CardTitle>
              <CardDescription>
                Follow these scenarios to test different profit protection features
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div className="border rounded-lg p-4">
                  <h3 className="font-semibold mb-3 flex items-center">
                    <Play className="w-4 h-4 mr-2" />
                    Scenario 1: Basic Profit Protection
                  </h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center space-x-2">
                      <div className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center text-blue-600 dark:text-blue-400 text-xs">1</div>
                      <span>Generate a signal using "Execute Analysis"</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <div className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center text-blue-600 dark:text-blue-400 text-xs">2</div>
                      <span>Select the signal in the "Test Signals" tab</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <div className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center text-blue-600 dark:text-blue-400 text-xs">3</div>
                      <span>Watch real-time profit tracking in "Profit Protection" tab</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <div className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center text-blue-600 dark:text-blue-400 text-xs">4</div>
                      <span>Monitor for profit protection alerts in "System Overview"</span>
                    </div>
                  </div>
                </div>

                <div className="border rounded-lg p-4">
                  <h3 className="font-semibold mb-3 flex items-center">
                    <TrendingUp className="w-4 h-4 mr-2 text-green-600" />
                    Scenario 2: Large Profit Protection (3%+ gains)
                  </h3>
                  <div className="space-y-2 text-sm">
                    <div>Expected: 60% profit lock when gains exceed 3%</div>
                    <div>Watch for: "LARGE GAINS PROTECTION" alerts</div>
                    <div>Telegram: Automatic notifications for profit-locking recommendations</div>
                  </div>
                </div>

                <div className="border rounded-lg p-4">
                  <h3 className="font-semibold mb-3 flex items-center">
                    <TrendingDown className="w-4 h-4 mr-2 text-red-600" />
                    Scenario 3: Profit Deterioration Alert
                  </h3>
                  <div className="space-y-2 text-sm">
                    <div>Expected: Alerts when profit drops 1%+ from peak</div>
                    <div>Watch for: Drawdown warnings and stop loss recommendations</div>
                    <div>Behavior: Only triggers on meaningful profit levels (2%+)</div>
                  </div>
                </div>

                <div className="border rounded-lg p-4">
                  <h3 className="font-semibold mb-3 flex items-center">
                    <Shield className="w-4 h-4 mr-2 text-blue-600" />
                    Scenario 4: Intelligent Throttling
                  </h3>
                  <div className="space-y-2 text-sm">
                    <div>Expected: Alerts only when signals weaken or become invalidated</div>
                    <div>Watch for: 5-minute minimum intervals between alerts</div>
                    <div>Behavior: No spam during healthy signal performance</div>
                  </div>
                </div>

                <Alert>
                  <Activity className="h-4 w-4" />
                  <AlertDescription>
                    <strong>Pro Tip:</strong> The system continuously monitors all active signals. 
                    You'll see live updates in the "System Overview" tab as profit protection 
                    features activate based on market conditions.
                  </AlertDescription>
                </Alert>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default TestTacticalAssistant;