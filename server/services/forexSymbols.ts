// Forex symbols available through Deriv API
export const FOREX_SYMBOLS = [
  // Major pairs
  'frxEURUSD', 'frxGBPUSD', 'frxUSDJPY', 'frxUSDCHF', 'frxAUDUSD', 'frxUSDCAD', 'frxNZDUSD',
  
  // Minor pairs
  'frxEURGBP', 'frxEURJPY', 'frxEURCHF', 'frxEURAUD', 'frxEURCAD', 'frxEURNZD',
  'frxGBPJPY', 'frxGBPCHF', 'frxGBPAUD', 'frxGBPCAD', 'frxGBPNZD',
  'frxAUDJPY', 'frxAUDCHF', 'frxAUDCAD', 'frxAUDNZD',
  'frxNZDJPY', 'frxNZDCHF', 'frxNZDCAD',
  'frxCADJPY', 'frxCADCHF', 'frxCHFJPY',
  
  // Exotic pairs
  'frxUSDSEK', 'frxUSDNOK', 'frxUSDDKK', 'frxUSDPLN', 'frxUSDCZK', 'frxUSDHUF',
  'frxUSDTRY', 'frxUSDZAR', 'frxUSDMXN', 'frxUSDSGD', 'frxUSDHKD'
];

export const FOREX_DISPLAY_NAMES: Record<string, string> = {
  'frxEURUSD': 'EUR/USD',
  'frxGBPUSD': 'GBP/USD', 
  'frxUSDJPY': 'USD/JPY',
  'frxUSDCHF': 'USD/CHF',
  'frxAUDUSD': 'AUD/USD',
  'frxUSDCAD': 'USD/CAD',
  'frxNZDUSD': 'NZD/USD',
  'frxEURGBP': 'EUR/GBP',
  'frxEURJPY': 'EUR/JPY',
  'frxEURCHF': 'EUR/CHF',
  'frxEURAUD': 'EUR/AUD',
  'frxEURCAD': 'EUR/CAD',
  'frxEURNZD': 'EUR/NZD',
  'frxGBPJPY': 'GBP/JPY',
  'frxGBPCHF': 'GBP/CHF',
  'frxGBPAUD': 'GBP/AUD',
  'frxGBPCAD': 'GBP/CAD',
  'frxGBPNZD': 'GBP/NZD',
  'frxAUDJPY': 'AUD/JPY',
  'frxAUDCHF': 'AUD/CHF',
  'frxAUDCAD': 'AUD/CAD',
  'frxAUDNZD': 'AUD/NZD',
  'frxNZDJPY': 'NZD/JPY',
  'frxNZDCHF': 'NZD/CHF',
  'frxNZDCAD': 'NZD/CAD',
  'frxCADJPY': 'CAD/JPY',
  'frxCADCHF': 'CAD/CHF',
  'frxCHFJPY': 'CHF/JPY',
  'frxUSDSEK': 'USD/SEK',
  'frxUSDNOK': 'USD/NOK',
  'frxUSDDKK': 'USD/DKK',
  'frxUSDPLN': 'USD/PLN',
  'frxUSDCZK': 'USD/CZK',
  'frxUSDHUF': 'USD/HUF',
  'frxUSDTRY': 'USD/TRY',
  'frxUSDZAR': 'USD/ZAR',
  'frxUSDMXN': 'USD/MXN',
  'frxUSDSGD': 'USD/SGD',
  'frxUSDHKD': 'USD/HKD'
};

export const FOREX_CATEGORIES = {
  MAJOR: ['frxEURUSD', 'frxGBPUSD', 'frxUSDJPY', 'frxUSDCHF', 'frxAUDUSD', 'frxUSDCAD', 'frxNZDUSD'],
  MINOR: ['frxEURGBP', 'frxEURJPY', 'frxEURCHF', 'frxGBPJPY', 'frxGBPCHF', 'frxAUDJPY', 'frxCHFJPY'],
  EXOTIC: ['frxUSDTRY', 'frxUSDZAR', 'frxUSDMXN', 'frxUSDSEK', 'frxUSDNOK', 'frxUSDPLN']
};

// Top 10 most traded forex pairs for automated signal generation
export const TOP_10_FOREX_PAIRS = [
  'frxEURUSD', // EUR/USD - Most traded pair (23% of forex volume)
  'frxUSDJPY', // USD/JPY - Second most traded (13% of forex volume)
  'frxGBPUSD', // GBP/USD - Third most traded (9% of forex volume)
  'frxUSDCHF', // USD/CHF - Fourth most traded (5% of forex volume)
  'frxAUDUSD', // AUD/USD - Fifth most traded (5% of forex volume)
  'frxUSDCAD', // USD/CAD - Sixth most traded (4% of forex volume)
  'frxNZDUSD', // NZD/USD - Seventh most traded (2% of forex volume)
  'frxEURGBP', // EUR/GBP - Eighth most traded (2% of forex volume)
  'frxEURJPY', // EUR/JPY - Ninth most traded (2% of forex volume)
  'frxGBPJPY'  // GBP/JPY - Tenth most traded (2% of forex volume)
];

// Trading sessions and their impact on volatility
export const TRADING_SESSIONS = {
  ASIAN: { start: 0, end: 9, pairs: ['frxUSDJPY', 'frxAUDUSD', 'frxNZDUSD'] },
  EUROPEAN: { start: 8, end: 17, pairs: ['frxEURUSD', 'frxGBPUSD', 'frxEURGBP'] },
  AMERICAN: { start: 13, end: 22, pairs: ['frxUSDCAD', 'frxUSDMXN'] },
  OVERLAP_ASIAN_EUROPEAN: { start: 8, end: 9, high_volatility: true },
  OVERLAP_EUROPEAN_AMERICAN: { start: 13, end: 17, high_volatility: true }
};

// Fundamental factors that heavily influence forex
export const FUNDAMENTAL_FACTORS = {
  INTEREST_RATES: ['Central Bank rates', 'Rate differentials', 'Monetary policy outlook'],
  ECONOMIC_INDICATORS: ['GDP', 'Inflation (CPI)', 'Employment data', 'Trade balance'],
  GEOPOLITICAL: ['Political stability', 'Trade wars', 'Brexit', 'Military conflicts'],
  MARKET_SENTIMENT: ['Risk-on/Risk-off', 'Safe haven demand', 'Commodity correlations']
};