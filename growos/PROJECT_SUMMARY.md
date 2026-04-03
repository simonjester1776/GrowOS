# GrowOS Project Summary

## Overview

GrowOS is a comprehensive, local-first plant monitoring system designed for BC growers. It features a modular architecture with ESP32-based Guardian hubs, nRF52832-based Buddy probes, a Node.js backend with MQTT support, and a React web dashboard.

## 🎯 Key Features Implemented

### 1. Backend API (Node.js + Express)
- **Authentication**: JWT-based auth with login/register/verify
- **Device Management**: CRUD operations for Guardians and Buddies
- **Sensor Data**: Historical data with time-series aggregation
- **Alert System**: Configurable rules with email/push notifications
- **Relay Control**: 4-channel relay control via MQTT
- **Dashboard API**: Overview stats, VPD analysis, environmental trends
- **Real-time**: WebSocket support via Socket.io
- **Database**: PostgreSQL with TimescaleDB extension for time-series data

### 2. Web Dashboard (React + TypeScript)
- **Dashboard**: Real-time overview with device status and environmental metrics
- **Device Management**: Register, configure, and monitor devices
- **Device Detail**: Sensor charts, relay controls, buddy management
- **Alerts**: View, acknowledge, and resolve alerts
- **Analytics**: VPD analysis, environmental trends, data visualization
- **Real-time Updates**: Live sensor data via WebSocket

### 3. MQTT Integration
- **Message Handler**: Processes sensor data, alerts, status updates
- **Device Commands**: Send relay commands to Guardians
- **Alert Evaluation**: Automatic threshold monitoring
- **WebSocket Bridge**: Real-time updates to connected clients

### 4. Database Schema
- **Users**: Authentication and user management
- **Devices**: Guardians and Buddies with metadata
- **Sensor Readings**: Time-series data with hypertable support
- **Alert Rules**: Configurable thresholds and notifications
- **Alert History**: Track and manage alerts
- **Relay States**: Store relay configurations and history

## 📁 File Structure

```
growos/
├── backend/
│   ├── src/
│   │   ├── routes/
│   │   │   ├── auth.js           # Authentication endpoints
│   │   │   ├── devices.js        # Device management
│   │   │   ├── sensors.js        # Sensor data endpoints
│   │   │   ├── alerts.js         # Alert management
│   │   │   ├── relays.js         # Relay control
│   │   │   └── dashboard.js      # Dashboard analytics
│   │   ├── services/
│   │   │   ├── mqttClient.js     # MQTT communication
│   │   │   └── cronJobs.js       # Scheduled tasks
│   │   ├── db/
│   │   │   ├── pool.js           # Database connection
│   │   │   └── migrate.js        # Schema migrations
│   │   ├── utils/
│   │   │   └── logger.js         # Winston logger
│   │   └── index.js              # Main entry point
│   ├── config/
│   │   └── mosquitto.conf        # MQTT broker config
│   ├── package.json
│   ├── Dockerfile
│   └── .env.example
├── web/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx     # Main dashboard
│   │   │   ├── Devices.tsx       # Device list
│   │   │   ├── DeviceDetail.tsx  # Device details
│   │   │   ├── Alerts.tsx        # Alert management
│   │   │   ├── Analytics.tsx     # VPD & trends
│   │   │   ├── Login.tsx         # Login page
│   │   │   └── Register.tsx      # Registration page
│   │   ├── hooks/
│   │   │   ├── useApi.ts         # API hooks
│   │   │   └── useSocket.ts      # WebSocket hooks
│   │   ├── types/
│   │   │   └── index.ts          # TypeScript types
│   │   ├── components/
│   │   │   └── Layout.tsx        # App layout
│   │   └── App.tsx               # Main app component
│   ├── package.json
│   ├── Dockerfile
│   └── nginx.conf
├── firmware/
│   ├── guardian/                 # ESP32-S3 firmware
│   └── buddy/                    # nRF52832 firmware
├── docker-compose.yml
└── README.md
```

## 🔌 API Endpoints

### Authentication
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/register`
- `GET /api/v1/auth/verify`

### Devices
- `GET /api/v1/devices` - List all devices
- `POST /api/v1/devices/register` - Register device
- `GET /api/v1/devices/:deviceId` - Get device details
- `PATCH /api/v1/devices/:deviceId` - Update device
- `DELETE /api/v1/devices/:deviceId` - Delete device
- `POST /api/v1/devices/:deviceId/command` - Send command

### Sensors
- `GET /api/v1/sensors/:deviceId/latest` - Latest reading
- `GET /api/v1/sensors/:deviceId/history` - Historical data
- `GET /api/v1/sensors/:deviceId/stats` - Statistics
- `GET /api/v1/sensors/:deviceId/export` - Export data

### Alerts
- `GET /api/v1/alerts/rules/:deviceId` - Get rules
- `POST /api/v1/alerts/rules` - Create rule
- `PATCH /api/v1/alerts/rules/:ruleId` - Update rule
- `DELETE /api/v1/alerts/rules/:ruleId` - Delete rule
- `GET /api/v1/alerts/history` - Alert history
- `POST /api/v1/alerts/history/:alertId/acknowledge`
- `POST /api/v1/alerts/history/:alertId/resolve`

### Dashboard
- `GET /api/v1/dashboard/overview` - Overview stats
- `GET /api/v1/dashboard/environment` - Environmental summary
- `GET /api/v1/dashboard/vpd-analysis` - VPD analysis
- `GET /api/v1/dashboard/activity` - Activity timeline

## 🚀 Deployment

### Local Development
```bash
# Start infrastructure
docker-compose up -d postgres mosquitto

# Start backend
cd backend
npm install
npm run db:migrate
npm run dev

# Start web dashboard
cd web
npm install
npm run dev
```

### Production (Docker)
```bash
docker-compose up -d
```

### Web Dashboard
The web dashboard has been deployed and is accessible at:
**https://2t3o6ur7kyijw.ok.kimi.link**

## 📊 Dashboard Features

### Real-time Monitoring
- Live connection status indicator
- Current environmental metrics (temp, humidity, CO₂, light, VPD)
- Device online/offline status
- Battery and signal strength

### Device Management
- Register new Guardians and Buddies
- View device details and connected buddies
- Control 4 relay channels
- Configure device settings

### Alert System
- View unacknowledged alerts
- Filter by device or status
- Acknowledge and resolve alerts
- Configure alert rules

### Analytics
- VPD zone distribution (pie chart)
- VPD over time (bar chart)
- Temperature and humidity trends
- Environmental recommendations

## 🔐 Security Features

- JWT-based authentication
- Password hashing with bcrypt
- Rate limiting on API endpoints
- CORS configuration
- Helmet.js for security headers

## 🔄 Real-time Features

- WebSocket connection via Socket.io
- Live sensor updates
- Alert notifications
- Device status changes
- Command acknowledgments

## 📈 Future Enhancements

### Backend
- [ ] Push notifications (Firebase Cloud Messaging)
- [ ] Machine learning for predictive alerts
- [ ] Data export scheduling
- [ ] Multi-tenant support
- [ ] API rate limiting per user

### Web Dashboard
- [ ] Mobile app (React Native)
- [ ] Dark mode
- [ ] Custom dashboard layouts
- [ ] Advanced charting options
- [ ] Data comparison between devices

### Firmware
- [ ] OTA update support
- [ ] Mesh networking for Buddies
- [ ] Power optimization
- [ ] Additional sensor support

## 📝 Notes

- The system is designed to be local-first, working without internet
- Cloud connectivity is optional for backup and remote access
- LoRa 915MHz is used for North American compliance
- All sensor data is stored locally on the Guardian's SD card
- The backend uses TimescaleDB for efficient time-series data storage
