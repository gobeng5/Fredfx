# VIX75 Signal Bot 🔔📉📈

A trading signal bot built with Python, Flask, and OpenAI that analyzes Volatility Indices (like VIX75) and sends high-confidence trading signals (entry, exit, take profit, stop loss) to Telegram.

## 🚀 Features
- Analyzes Volatility 75, 10, 25 Index using chart patterns & GPT-4
- Detects trend, entry & exit points, stop loss, take profit
- Sends top-confidence signal to Telegram
- Flask API for UptimeRobot keep-alive
- Supports real-time price fetching and pattern detection

## 📦 Technologies
- Python, Flask
- OpenAI GPT-4
- Telegram Bot API
- Schedule (for timed analysis)
- Real market data via Deriv

## ⚙️ How to Run

1. Install dependencies:
   ```bash
   pip install -r requirements.txt