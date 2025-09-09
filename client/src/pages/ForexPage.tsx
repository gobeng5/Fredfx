import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Globe, TrendingUp, AlertTriangle, Calculator, Clock, DollarSign } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';

interface ForexSymbol {
  symbol: string;
  displayName: string;
  category: string;
}

interface TradingSession {
  session: string;
  volatility: 'HIGH' | 'MEDIUM' | 'LOW';
  activeMarkets: string[];
  optimalPairs: string[];
}

interface NewsEvent {
  time: string;
  currency: string;
  impact: 'HIGH' | 'MEDIUM' | 'LOW';
  event: string;
  affectedPairs: string[];
}

interface PositionSizeResult {
  lotSize: number;
  units: number;
  riskAmount: number;
  recommendation: string;
}

export default function ForexPage() {
  const queryClient = useQueryClient();
  const [selectedSymbol, setSelectedSymbol] = useState<string>('');
  const [positionForm, setPositionForm] = useState({
    symbol: '',
    accountBalance: '',
    riskPercent: '',
    stopLossDistance: ''
  });
  const [correlationSymbols, setCorrelationSymbols] = useState<string[]>([]);

  // Fetch forex symbols
  const { data: symbols, isLoading: symbolsLoading } = useQuery<ForexSymbol[]>({
    queryKey: ['/api/forex/symbols'],
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Fetch trading session info
  const { data: sessionInfo, isLoading: sessionLoading } = useQuery<TradingSession>({
    queryKey: ['/api/forex/session'],
    refetchInterval: 60 * 1000, // Update every minute
  });

  // Fetch news schedule
  const { data: newsSchedule, isLoading: newsLoading } = useQuery<NewsEvent[]>({
    queryKey: ['/api/forex/news-schedule'],
    refetchInterval: 5 * 60 * 1000, // Update every 5 minutes
  });

  // Position size calculation mutation
  const positionSizeMutation = useMutation({
    mutationFn: (data: any) => apiRequest('/api/forex/position-size', 'POST', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/forex'] });
    }
  });

  // Correlation warnings mutation
  const correlationMutation = useMutation({
    mutationFn: (data: { activeSymbols: string[] }) => 
      apiRequest('/api/forex/correlation-warnings', 'POST', data),
  });

  const handlePositionCalculation = () => {
    const { symbol, accountBalance, riskPercent, stopLossDistance } = positionForm;
    
    if (!symbol || !accountBalance || !riskPercent || !stopLossDistance) {
      return;
    }

    positionSizeMutation.mutate({
      symbol,
      accountBalance: parseFloat(accountBalance),
      riskPercent: parseFloat(riskPercent),
      stopLossDistance: parseFloat(stopLossDistance)
    });
  };

  const handleCorrelationCheck = () => {
    if (correlationSymbols.length > 0) {
      correlationMutation.mutate({ activeSymbols: correlationSymbols });
    }
  };

  const getVolatilityColor = (volatility: string) => {
    switch (volatility) {
      case 'HIGH': return 'text-red-500';
      case 'MEDIUM': return 'text-yellow-500';
      case 'LOW': return 'text-green-500';
      default: return 'text-gray-500';
    }
  };

  const getImpactColor = (impact: string) => {
    switch (impact) {
      case 'HIGH': return 'bg-red-100 text-red-800';
      case 'MEDIUM': return 'bg-yellow-100 text-yellow-800';
      case 'LOW': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'MAJOR': return 'bg-blue-100 text-blue-800';
      case 'MINOR': return 'bg-green-100 text-green-800';
      case 'EXOTIC': return 'bg-purple-100 text-purple-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (symbolsLoading || sessionLoading || newsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-2 mb-6">
        <Globe className="w-8 h-8 text-blue-500" />
        <h1 className="text-3xl font-bold">Forex Trading Dashboard</h1>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="symbols">Symbols</TabsTrigger>
          <TabsTrigger value="session">Session</TabsTrigger>
          <TabsTrigger value="news">News</TabsTrigger>
          <TabsTrigger value="tools">Tools</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Clock className="w-5 h-5" />
                  Current Session
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span>Session:</span>
                    <Badge variant="outline">{sessionInfo?.session || 'Loading...'}</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span>Volatility:</span>
                    <span className={getVolatilityColor(sessionInfo?.volatility || '')}>
                      {sessionInfo?.volatility || 'Loading...'}
                    </span>
                  </div>
                  <div className="text-sm text-gray-600">
                    Active Markets: {sessionInfo?.activeMarkets.join(', ') || 'Loading...'}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <TrendingUp className="w-5 h-5" />
                  Available Pairs
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span>Total Pairs:</span>
                    <Badge variant="outline">{symbols?.length || 0}</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span>Major Pairs:</span>
                    <Badge variant="outline">
                      {symbols?.filter(s => s.category === 'MAJOR').length || 0}
                    </Badge>
                  </div>
                  <div className="flex justify-between">
                    <span>Minor Pairs:</span>
                    <Badge variant="outline">
                      {symbols?.filter(s => s.category === 'MINOR').length || 0}
                    </Badge>
                  </div>
                  <div className="flex justify-between">
                    <span>Exotic Pairs:</span>
                    <Badge variant="outline">
                      {symbols?.filter(s => s.category === 'EXOTIC').length || 0}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5" />
                  Optimal Pairs
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {sessionInfo?.optimalPairs.map((pair) => (
                    <div key={pair} className="flex justify-between">
                      <span className="text-sm">{pair}</span>
                      <Badge variant="secondary" className="text-xs">
                        {symbols?.find(s => s.symbol === pair)?.displayName || pair}
                      </Badge>
                    </div>
                  )) || <div className="text-sm text-gray-500">Loading...</div>}
                </div>
              </CardContent>
            </Card>
          </div>

          {newsSchedule && newsSchedule.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Upcoming News Events</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {newsSchedule.slice(0, 3).map((event, index) => (
                    <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <Badge className={getImpactColor(event.impact)}>
                          {event.impact}
                        </Badge>
                        <div>
                          <div className="font-medium">{event.event}</div>
                          <div className="text-sm text-gray-600">{event.currency} • {event.time}</div>
                        </div>
                      </div>
                      <div className="text-sm text-gray-500">
                        {event.affectedPairs.length} pairs affected
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="symbols" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Available Forex Symbols</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {symbols?.map((symbol) => (
                  <div key={symbol.symbol} className="p-4 border rounded-lg hover:bg-gray-50 cursor-pointer">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-medium">{symbol.displayName}</h3>
                      <Badge className={getCategoryColor(symbol.category)}>
                        {symbol.category}
                      </Badge>
                    </div>
                    <div className="text-sm text-gray-600">{symbol.symbol}</div>
                  </div>
                )) || <div className="text-center text-gray-500">Loading symbols...</div>}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="session" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Trading Session Analysis</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h3 className="font-medium mb-3">Current Session Details</h3>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span>Session:</span>
                        <Badge variant="outline">{sessionInfo?.session}</Badge>
                      </div>
                      <div className="flex justify-between">
                        <span>Volatility:</span>
                        <span className={getVolatilityColor(sessionInfo?.volatility || '')}>
                          {sessionInfo?.volatility}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 className="font-medium mb-3">Active Markets</h3>
                    <div className="space-y-2">
                      {sessionInfo?.activeMarkets.map((market) => (
                        <Badge key={market} variant="secondary" className="mr-2">
                          {market}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="font-medium mb-3">Optimal Trading Pairs</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {sessionInfo?.optimalPairs.map((pair) => (
                      <div key={pair} className="p-3 border rounded-lg">
                        <div className="font-medium">{pair}</div>
                        <div className="text-sm text-gray-600">
                          {symbols?.find(s => s.symbol === pair)?.displayName || pair}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="news" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Economic News Schedule</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {newsSchedule?.map((event, index) => (
                  <div key={index} className="p-4 border rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <Badge className={getImpactColor(event.impact)}>
                          {event.impact}
                        </Badge>
                        <h3 className="font-medium">{event.event}</h3>
                      </div>
                      <div className="text-sm text-gray-600">{event.time}</div>
                    </div>
                    <div className="text-sm text-gray-600 mb-2">
                      Currency: {event.currency}
                    </div>
                    <div className="text-sm">
                      <span className="font-medium">Affected Pairs:</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {event.affectedPairs.map((pair) => (
                          <Badge key={pair} variant="outline" className="text-xs">
                            {symbols?.find(s => s.symbol === pair)?.displayName || pair}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                )) || <div className="text-center text-gray-500">No news events scheduled</div>}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tools" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calculator className="w-5 h-5" />
                  Position Size Calculator
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Forex Symbol</Label>
                  <Select value={positionForm.symbol} onValueChange={(value) => 
                    setPositionForm(prev => ({ ...prev, symbol: value }))
                  }>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a forex pair" />
                    </SelectTrigger>
                    <SelectContent>
                      {symbols?.map((symbol) => (
                        <SelectItem key={symbol.symbol} value={symbol.symbol}>
                          {symbol.displayName} ({symbol.symbol})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Account Balance ($)</Label>
                  <Input
                    type="number"
                    value={positionForm.accountBalance}
                    onChange={(e) => setPositionForm(prev => ({ ...prev, accountBalance: e.target.value }))}
                    placeholder="Enter account balance"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Risk Percentage (%)</Label>
                  <Input
                    type="number"
                    value={positionForm.riskPercent}
                    onChange={(e) => setPositionForm(prev => ({ ...prev, riskPercent: e.target.value }))}
                    placeholder="Enter risk percentage"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Stop Loss Distance (pips)</Label>
                  <Input
                    type="number"
                    value={positionForm.stopLossDistance}
                    onChange={(e) => setPositionForm(prev => ({ ...prev, stopLossDistance: e.target.value }))}
                    placeholder="Enter stop loss distance"
                  />
                </div>

                <Button onClick={handlePositionCalculation} disabled={positionSizeMutation.isPending}>
                  {positionSizeMutation.isPending ? 'Calculating...' : 'Calculate Position Size'}
                </Button>

                {positionSizeMutation.data && (
                  <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                    <h4 className="font-medium mb-2">Position Size Results:</h4>
                    <div className="space-y-1 text-sm">
                      <div>Lot Size: {positionSizeMutation.data.lotSize}</div>
                      <div>Units: {positionSizeMutation.data.units}</div>
                      <div>Risk Amount: ${positionSizeMutation.data.riskAmount}</div>
                      <div className="text-blue-600">{positionSizeMutation.data.recommendation}</div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5" />
                  Correlation Analysis
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Active Trading Pairs</Label>
                  <div className="text-sm text-gray-600 mb-2">
                    Select pairs you're currently trading to check for correlations
                  </div>
                  <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto">
                    {symbols?.slice(0, 20).map((symbol) => (
                      <label key={symbol.symbol} className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={correlationSymbols.includes(symbol.symbol)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setCorrelationSymbols(prev => [...prev, symbol.symbol]);
                            } else {
                              setCorrelationSymbols(prev => prev.filter(s => s !== symbol.symbol));
                            }
                          }}
                        />
                        <span className="text-sm">{symbol.displayName}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <Button onClick={handleCorrelationCheck} disabled={correlationMutation.isPending}>
                  {correlationMutation.isPending ? 'Analyzing...' : 'Check Correlations'}
                </Button>

                {correlationMutation.data?.warnings && (
                  <div className="mt-4 space-y-2">
                    <h4 className="font-medium">Correlation Warnings:</h4>
                    {correlationMutation.data.warnings.map((warning: string, index: number) => (
                      <Alert key={index}>
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription>{warning}</AlertDescription>
                      </Alert>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}