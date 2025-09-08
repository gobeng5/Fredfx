# VIX Signal Bot - Trading Dashboard

## Overview

This is a full-stack trading signal bot application focused on volatility indices (V10, V25, V75). The system provides real-time market analysis, generates trading signals using technical indicators, and distributes alerts via Telegram. It features a modern web dashboard for monitoring signals, performance metrics, and system status.

## System Architecture

The application follows a monorepo structure with a clear separation between client and server:

- **Frontend**: React-based SPA with TypeScript, using shadcn/ui components and Tailwind CSS
- **Backend**: Express.js REST API with WebSocket support for real-time updates
- **Database**: PostgreSQL with Drizzle ORM for schema management
- **External Integrations**: Deriv API for market data, Telegram Bot API for notifications
- **Build System**: Vite for frontend bundling, esbuild for server bundling

## Key Components

### Frontend Architecture
- **React 18** with TypeScript for type safety
- **shadcn/ui** component library built on Radix UI primitives
- **Tailwind CSS** for styling with custom dark theme
- **TanStack React Query** for server state management
- **Wouter** for lightweight client-side routing
- **WebSocket client** for real-time data updates

### Backend Architecture
- **Express.js** server with TypeScript
- **WebSocket Server** for real-time client communication
- **Service Layer**: Modular services for external API integration
- **Storage Layer**: Abstracted storage interface (currently in-memory, designed for PostgreSQL)

### Database Schema
The system uses four main tables:
- `signals`: Trading signals with entry/exit prices, confidence, and results
- `market_data`: Real-time price and volume data for symbols
- `technical_indicators`: RSI, MACD, Bollinger Bands, and moving averages
- `telegram_subscribers`: User subscriptions for signal notifications

## Data Flow

1. **Market Data Collection**: Deriv API WebSocket connection streams real-time tick data
2. **Technical Analysis**: Real-time calculation of indicators (RSI, MACD, Bollinger Bands, SMA/EMA)
3. **Signal Generation**: Algorithm analyzes indicators to generate BUY/SELL/HOLD signals with confidence scores
4. **Signal Distribution**: New signals trigger Telegram notifications to subscribers
5. **Real-time Updates**: WebSocket broadcasts price updates, new signals, and indicator changes to connected clients
6. **Performance Tracking**: Signal results are tracked and analyzed for accuracy metrics

## External Dependencies

### Core Dependencies
- **Drizzle ORM**: Database schema management and queries
- **@neondatabase/serverless**: PostgreSQL driver optimized for serverless environments
- **WebSocket (ws)**: Real-time communication between server and clients
- **express**: HTTP server framework

### Frontend Dependencies
- **@tanstack/react-query**: Server state management and caching
- **@radix-ui/***: Accessible UI primitive components
- **tailwindcss**: Utility-first CSS framework
- **wouter**: Lightweight routing solution

### External Services
- **Deriv API**: Real-time market data via WebSocket (wss://ws.binaryws.com/websockets/v3)
- **Telegram Bot API**: Push notifications for trading signals
- **Neon Database**: PostgreSQL hosting (via DATABASE_URL environment variable)

## Deployment Strategy

The application is configured for deployment on Replit with autoscaling:

- **Build Process**: 
  - Frontend: Vite builds React app to `dist/public`
  - Backend: esbuild bundles server to `dist/index.js`
- **Runtime**: Node.js 20 with PostgreSQL 16 module
- **Port Configuration**: Server runs on port 5000, external port 80
- **Environment**: Supports both development and production modes

### Environment Variables Required
- `DATABASE_URL`: PostgreSQL connection string
- `DERIV_APP_ID`: Deriv API application ID (defaults to 1089)
- `TELEGRAM_BOT_TOKEN`: Telegram bot authentication token

## Changelog

```
Changelog:
- June 18, 2025. Initial setup
- June 18, 2025. Fixed Execute Analysis button and implemented automatic Telegram signal sending for 75%+ confidence signals
- June 18, 2025. Successfully implemented complete trading signal system with take profit/stop loss calculations and verified Telegram delivery to user chat ID 693362442
- June 18, 2025. Fixed take profit and stop loss calculations - signals now include complete entry/exit points with proper risk management (1.5% stop loss, 1.5x-2.5x risk-reward ratios)
- June 18, 2025. Implemented automatic signal performance tracking system that monitors every price tick against active signals to detect take profit/stop loss hits in real-time, with Telegram result notifications and comprehensive performance analytics API endpoint
- June 20, 2025. Added comprehensive Configuration tab to dashboard for bot parameter customization including confidence thresholds, risk management settings, and volatility multipliers
- June 20, 2025. Integrated improved percentage-based trade level generation function with configurable TP/SL percentages based on confidence levels (2-8% TP, 2-3% SL) and volatility adjustments
- June 20, 2025. Implemented selective Telegram broadcasting - only the highest confidence signal (75%+) is sent to Telegram every 30 seconds instead of all signals, with enhanced table display limited to 10 signals maximum and improved visual formatting with color-coded entry/exit points
- July 12, 2025. Successfully implemented automated signal generation system with 15-minute intervals, fixed timing issues by ensuring generator waits for Deriv API connection, and integrated comprehensive automated signal dashboard with real-time status monitoring and manual signal generation capabilities
- July 12, 2025. Added Advanced Analysis tab with multi-timeframe analysis, market regime detection, volume/momentum analysis, and liquidity trap detection - provides professional-grade trading insights with visual progress indicators and comprehensive analysis summary
- July 12, 2025. Implemented complete signal categorization system (SCALP/DAY/SWING) with automated conflict prevention, enhanced quality control filters (80%+ confidence for automated generation), and comprehensive signal management system to ensure only high-probability, accurate signals for actual trading
- July 12, 2025. Successfully integrated intelligent signal type clustering system that analyzes volatility patterns, momentum indicators, market structure, and timeframe characteristics to automatically categorize signals into SCALP (high volatility, short-term), DAY (medium volatility, intraday), and SWING (low volatility, longer-term) trades with comprehensive clustering scores and reasoning
- July 12, 2025. Implemented keep-alive mechanism with 5-minute ping intervals to reduce sleep time - system performs automatic database operations, background maintenance, and service monitoring to maintain continuous operation for 24/7 signal generation
- July 16, 2025. CRITICAL FIX: Implemented enhanced risk management system to address poor gain-to-loss ratio issue - enforces minimum 2.5:1 risk-reward ratios, confidence-based position sizing, dynamic stop-loss calculations, and consecutive loss protection to ensure profitability despite good win rates
- July 16, 2025. MAJOR ENHANCEMENT: Successfully integrated top 10 forex pairs into main dashboard - enhanced MarketOverview component with organized sections for synthetic indices (V10, V25, V75, BULL, BEAR) and forex major pairs (EUR/USD, GBP/USD, USD/JPY, AUD/USD, USD/CAD, USD/CHF, NZD/USD, EUR/GBP, EUR/JPY, GBP/JPY) with real-time pricing and automated signal generation
- July 17, 2025. FINAL SYSTEM DEPLOYMENT: Completed comprehensive system testing and validation - confirmed live market data streaming, signal generation with 85-90% confidence levels, Telegram integration, real-time performance tracking, and compact dashboard interface. System ready for production deployment with medium-high grade signals suitable for paper trading and educational purposes with proper risk management.
- July 17, 2025. ECONOMIC NEWS INTEGRATION: Successfully implemented comprehensive real-time economic calendar system with live economic event tracking, impact analysis, and fundamental analysis integration. Added EconomicNewsPanel component to dashboard with 24-hour event calendar, high-impact event alerts, currency pair impact analysis, and volatility adjustment calculations. Enhanced fundamental analysis service with real economic calendar data instead of mock data for improved signal accuracy.
- July 18, 2025. SCOPE ROLLBACK: Successfully rolled back system to focus exclusively on volatility indices (V10, V25, V75). Removed all forex integrations, RDBULL/RDBEAR symbols, and forex-specific components. Updated MarketOverview, signalTracker, automatedSignalGenerator, and routes to handle only three core volatility indices. System now provides clean, focused volatility index analysis with real-time Deriv API data streaming and signal generation.
- July 21, 2025. ENHANCED FEATURES INTEGRATION: Successfully implemented 4 professional-grade trading features with dedicated Enhanced tab in dashboard: ATR-based adaptive Stop Loss/Take Profit system with volatility regime classification, Chart pattern recognition for double tops/bottoms and reversal patterns, Time-based signal filtering with trading session analysis, and Historical backtesting engine with performance grading. Added comprehensive API endpoints (/api/analysis/atr, /api/analysis/patterns, /api/analysis/time-filter, /api/analysis/backtest) and integrated all features into automated signal generation. Fixed critical Deriv API validation error by ensuring all req_id parameters are integers instead of strings.
- July 21, 2025. TACTICAL ALERT STABILITY: Enhanced tactical trading assistant with intelligent alert throttling system that prevents notification spam and only triggers alerts on significant market condition changes (20% health score threshold, 5-minute minimum intervals). Fixed React key warnings and implemented comprehensive alert state tracking to ensure stable, meaningful notifications that protect capital without overwhelming users with constant updates.
- July 21, 2025. ACTIONABLE TRADING ALERTS: Implemented sophisticated alert system providing specific trading actions - recalculated stop loss prices for weakening signals (1.5% risk), tighter emergency stop losses for critical signals (0.8% risk), and immediate close recommendations for invalidated signals to lock profits or minimize losses. Enhanced Telegram notifications with precise entry points, calculated stop loss levels, and profit/loss percentages to maximize trading performance and capital protection.
- July 21, 2025. PROFIT PROTECTION ENHANCEMENT: Revolutionized tactical trading assistant to prioritize profit maximization over capital preservation. Implemented tiered profit protection system (20%-80% gain protection based on profit levels), profit deterioration warnings, enhanced recommendations with profit-focused messaging, and intelligent stop loss calculations that lock in gains rather than just protect capital. System now provides actionable profit-locking strategies for 1%+ gains with breakeven+1% trails for 2%+ profits and aggressive protection for 5%+ gains.
- July 21, 2025. CRITICAL STOP LOSS FIX: Fixed major bug in tactical assistant stop loss calculations where BUY signals were incorrectly showing stop loss prices above current market price. Implemented proper stop loss logic using real-time Deriv API prices - for BUY signals, stop loss is now correctly calculated as CurrentPrice × (1 - RiskPercent) placing it BELOW current price. Enhanced real-time market price integration with live stream data (R_10: 6323.439, R_25: 2917.767, R_75: 95545.0135) for accurate trading recommendations. System now provides precise, actionable stop loss prices for actual trading.
- July 21, 2025. INTELLIGENT TACTICAL ENHANCEMENT: Revolutionized tactical assistant to only trigger recommendations when signals weaken or become invalidated, eliminating unnecessary alerts during healthy signal performance. Implemented dynamic stop loss system with peak profit tracking that allows price retests while protecting accumulated gains through tiered protection (75% lock for 5%+ profits, 60% lock for 3%+ profits, breakeven+buffer for smaller gains). Enhanced TypeScript type safety and real-time market integration for stable, actionable profit protection alerts with intelligent throttling system.
```

## User Preferences

```
Preferred communication style: Simple, everyday language.
```