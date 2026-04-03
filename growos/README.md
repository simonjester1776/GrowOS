# GrowOS - Plant Monitoring System

A local-first plant monitoring system for BC growers, featuring ESP32-based Guardian hubs and nRF52832-based Buddy probes communicating over LoRa 915MHz.

## 🌱 Architecture Overview

```
┌─────────────────────────────────────────────────┐
│                  CLOUD (OPTIONAL)               │
│  • AWS IoT Core / Self-hosted MQTT             │
│  • End-to-end encrypted                         │
│  • Data backup only (local-first design)        │
└─────────────────────────────────────────────────┘
                            ↑
┌─────────────────────────────────────────────────┐
│                 GROW GUARDIAN (Hub)             │
│  • MQTT broker (Mosquitto)                      │
│  • HTTP REST API (ESP32 AsyncWebServer)         │
│  • LoRa gateway (single-channel, 915MHz)        │
│  • SQLite database (local storage)              │
└─────────────────────────────────────────────────┘
         ↑               ↑               ↑
┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│   Buddy 1   │ │   Buddy 2   │ │   Buddy N   │
│ • LoRa star │ • LoRa star   │ • LoRa star   │
│ • Sleep 99% │ • ACK/retry   │ • 20+ nodes   │
└─────────────┘ └─────────────┘ └─────────────┘
```

## 📁 Project Structure

```
growos/
├── backend/          # Node.js REST API + MQTT broker bridge
│   ├── src/
│   │   ├── routes/       # API routes (auth, devices, sensors, alerts, relays)
│   │   ├── services/     # MQTT client, cron jobs
│   │   ├── db/           # Database pool and migrations
│   │   └── utils/        # Logger and utilities
│   ├── package.json
│   └── .env.example
├── web/              # React + TypeScript Dashboard
│   ├── src/
│   │   ├── pages/        # Dashboard, Devices, Alerts, Analytics
│   │   ├── hooks/        # API hooks and Socket.io hooks
│   │   └── types/        # TypeScript type definitions
│   └── package.json
├── firmware/
│   ├── guardian/     # ESP32-S3 hub firmware (C++/PlatformIO)
│   └── buddy/        # nRF52832 probe firmware (C++/PlatformIO)
└── docker-compose.yml
```

## 🚀 Quick Start

### Prerequisites
- Node.js 20+
- PostgreSQL 16+ (with TimescaleDB extension recommended)
- MQTT Broker (Mosquitto)
- PlatformIO CLI (for firmware)

### 1. Backend Setup

```bash
cd backend
cp .env.example .env
npm install
npm run db:migrate
npm run dev
```

### 2. Web Dashboard

```bash
cd web
npm install
npm run dev
```

### 3. Full Stack (Docker)

```bash
docker-compose up
```

## 🔧 Hardware Components

### Guardian (Room Hub)
- **MCU**: ESP32-S3 (Dual-core, WiFi 4/Bluetooth 5)
- **LoRa**: RA-01H (SX1276, 915MHz NA)
- **Sensors**: SCD41 (CO₂), SHT45 (Temp/Humidity), BMP388 (Pressure), BH1750 (Light), SGP40 (VOC)
- **Power**: 10,000mAh LiPo, USB-C PD, Solar input with MPPT
- **Relays**: 4x 10A/120V relay outputs
- **Storage**: 16GB microSD

### Buddy (Plant Probe)
- **MCU**: nRF52832 (Bluetooth 5.2)
- **LoRa**: E22-900M30S (SX1262, 915MHz NA, 5km range)
- **Sensors**: Capacitive moisture, DS18B20 (soil temp), Custom EC sensor
- **Power**: LIR2450 rechargeable coin cell (1+ years @ 15min intervals)
- **Rating**: IP68 (1m submersible)

## 📡 API Endpoints

### Authentication
- `POST /api/v1/auth/login` - User login
- `POST /api/v1/auth/register` - User registration
- `GET /api/v1/auth/verify` - Verify token

### Devices
- `GET /api/v1/devices` - List devices
- `POST /api/v1/devices/register` - Register new device
- `GET /api/v1/devices/:deviceId` - Get device details
- `PATCH /api/v1/devices/:deviceId` - Update device
- `POST /api/v1/devices/:deviceId/command` - Send command to device

### Sensors
- `GET /api/v1/sensors/:deviceId/latest` - Latest readings
- `GET /api/v1/sensors/:deviceId/history` - Historical data
- `GET /api/v1/sensors/:deviceId/export` - Export data (CSV/JSON)

### Alerts
- `GET /api/v1/alerts/rules/:deviceId` - Get alert rules
- `POST /api/v1/alerts/rules` - Create alert rule
- `GET /api/v1/alerts/history` - Alert history
- `POST /api/v1/alerts/history/:alertId/acknowledge` - Acknowledge alert

### Dashboard
- `GET /api/v1/dashboard/overview` - Dashboard overview
- `GET /api/v1/dashboard/vpd-analysis` - VPD analysis

## 📊 Features

### Real-time Monitoring
- Live sensor data via WebSocket
- Temperature, humidity, CO₂, light, VPD tracking
- Soil moisture, EC, pH from Buddy probes

### Alert System
- Configurable threshold alerts
- Email and push notifications
- Alert history and acknowledgment

### Device Management
- Guardian and Buddy device registration
- Relay control (4 channels)
- Firmware version tracking
- Battery and signal monitoring

### Analytics
- VPD (Vapor Pressure Deficit) analysis
- Environmental trend charts
- Data export (CSV/JSON)
- Historical data aggregation

## 🔐 Security

- JWT-based authentication
- AES-128 encrypted LoRa communication
- TLS 1.3 for WiFi/HTTP
- SQLCipher for local database encryption
- Signed firmware updates (Ed25519)

## 🌐 Environment Variables

### Backend
```env
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://growos:growos_dev@localhost:5432/growos
MQTT_HOST=localhost
MQTT_PORT=1883
JWT_SECRET=change_me_in_production
```

### Web Dashboard
```env
VITE_API_URL=http://localhost:3000/api/v1
VITE_SOCKET_URL=http://localhost:3000
```

## 📜 License

MIT License - See LICENSE file for details

## 🤝 Contributing

Contributions are welcome! Please read the contributing guidelines before submitting PRs.

## 📧 Support

For support, email support@growos.com or join our Discord community.
