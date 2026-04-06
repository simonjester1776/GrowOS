# GrowOS - Plant Monitoring System

[![CI/CD](https://github.com/yourusername/growos/actions/workflows/ci-cd.yml/badge.svg)](https://github.com/yourusername/growos/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Docker](https://img.shields.io/badge/docker-ready-blue.svg)](https://www.docker.com/)

A local-first, production-ready plant monitoring system for growers. Features ESP32-based Guardian hubs and nRF52832-based Buddy probes communicating over LoRa 915MHz.

## 🌟 Features

- **Real-time Monitoring**: Temperature, humidity, CO₂, light, VPD tracking
- **Soil Sensors**: Moisture, EC, pH from Buddy probes
- **Smart Alerts**: Configurable thresholds with email/push notifications
- **Relay Control**: 4-channel relay control for automation
- **VPD Analysis**: Optimize your grow environment
- **OTA Updates**: Remote firmware updates for devices
- **Offline Support**: PWA with service worker caching
- **Dark Mode**: Easy on the eyes during night checks
- **Mobile Ready**: Responsive design works on all devices

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        CLOUD (Optional)                      │
│         AWS IoT Core / Self-hosted MQTT Bridge               │
│              End-to-end encrypted, backup only               │
└─────────────────────────────────────────────────────────────┘
                              ↑
┌─────────────────────────────────────────────────────────────┐
│                    GROW GUARDIAN (Hub)                       │
│  • MQTT Broker (Mosquitto)                                   │
│  • REST API (Node.js + Express)                              │
│  • LoRa Gateway (915MHz)                                     │
│  • PostgreSQL + TimescaleDB                                  │
│  • Redis Caching                                             │
└─────────────────────────────────────────────────────────────┘
           ↑                    ↑                    ↑
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│    Buddy 1      │  │    Buddy 2      │  │    Buddy N      │
│  • LoRa Star    │  │  • LoRa Star    │  │  • LoRa Star    │
│  • 15min TX     │  │  • ACK/Retry    │  │  • 20+ nodes    │
└─────────────────┘  └─────────────────┘  └─────────────────┘
```

## 🚀 Quick Start

### Prerequisites

- Docker 24.0+ and Docker Compose 2.20+
- Node.js 20+ (for development)
- 4GB RAM, 20GB disk space

### Installation

```bash
# Clone repository
git clone https://github.com/yourusername/growos.git
cd growos

# Run setup script
./scripts/setup.sh

# Start services
docker-compose up -d

# Run migrations
cd backend && npm run db:migrate
```

### Access

- **Web Dashboard**: http://localhost
- **API**: http://localhost:3000
- **API Docs**: http://localhost:3000/api-docs
- **MQTT**: localhost:1883

## 📁 Project Structure

```
growos/
├── backend/              # Node.js REST API + MQTT
│   ├── src/
│   │   ├── routes/       # API endpoints
│   │   ├── middleware/   # Auth, validation, errors
│   │   ├── services/     # MQTT, Redis, cron
│   │   └── db/           # Migrations, pool
│   ├── config/           # Mosquitto config
│   ├── Dockerfile
│   └── package.json
├── web/                  # React + TypeScript Dashboard
│   ├── src/
│   │   ├── pages/        # Dashboard, Devices, Alerts
│   │   ├── hooks/        # API hooks, WebSocket
│   │   ├── components/   # UI components
│   │   └── types/        # TypeScript types
│   ├── public/           # PWA manifest, service worker
│   ├── Dockerfile
│   └── package.json
├── firmware/
│   ├── guardian/         # ESP32-S3 firmware
│   └── buddy/            # nRF52832 firmware
├── scripts/              # Deployment, backup, setup
├── docker-compose.yml
└── DEPLOYMENT.md         # Production deployment guide
```

## 🔌 API Endpoints

### Authentication
- `POST /api/v1/auth/login` - User login
- `POST /api/v1/auth/register` - User registration
- `GET /api/v1/auth/verify` - Verify token

### Devices
- `GET /api/v1/devices` - List devices
- `POST /api/v1/devices/register` - Register device
- `GET /api/v1/devices/:deviceId` - Get device details
- `POST /api/v1/devices/:deviceId/command` - Send command

### Sensors
- `GET /api/v1/sensors/:deviceId/latest` - Latest readings
- `GET /api/v1/sensors/:deviceId/history` - Historical data
- `GET /api/v1/sensors/:deviceId/export` - Export (CSV/JSON)

### Alerts
- `GET /api/v1/alerts/rules/:deviceId` - Get alert rules
- `POST /api/v1/alerts/rules` - Create alert rule
- `GET /api/v1/alerts/history` - Alert history

### Dashboard
- `GET /api/v1/dashboard/overview` - Dashboard overview
- `GET /api/v1/dashboard/vpd-analysis` - VPD analysis

### Firmware
- `GET /api/v1/firmware/versions` - List firmware versions
- `POST /api/v1/firmware/upload` - Upload firmware
- `POST /api/v1/firmware/update/:deviceId` - Trigger OTA update

## 🔐 Security

- **Authentication**: JWT with refresh tokens
- **Passwords**: Bcrypt hashing
- **API**: Rate limiting, input validation
- **MQTT**: TLS/SSL support
- **Database**: SQL injection protection
- **CORS**: Configurable origins

## 📊 Monitoring

### Health Checks

```bash
# Full health check
curl http://localhost:3000/health

# Kubernetes probes
curl http://localhost:3000/ready
curl http://localhost:3000/live
```

### Logs

```bash
# View all logs
docker-compose logs -f

# View specific service
docker-compose logs -f backend
```

## 💾 Backup

```bash
# Full backup
./scripts/backup.sh full

# Database only
./scripts/backup.sh data

# Automated daily backups (cron)
0 2 * * * /path/to/growos/scripts/backup.sh full
```

## 🚀 Production Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for detailed production deployment instructions.

```bash
# Production deployment
./scripts/deploy.sh production
```

## 🛠️ Development

```bash
# Start infrastructure
docker-compose up -d postgres mosquitto redis

# Backend
cd backend
npm install
npm run dev

# Frontend
cd web
npm install
npm run dev
```

## 🧪 Testing

```bash
# Backend tests
cd backend
npm test

# Frontend tests
cd web
npm test
```

## 🔧 Hardware

### Guardian (Room Hub)
- **MCU**: ESP32-S3 (Dual-core, WiFi 4/Bluetooth 5)
- **LoRa**: RA-01H (SX1276, 915MHz NA)
- **Sensors**: SCD41, SHT45, BMP388, BH1750, SGP40
- **Power**: 10,000mAh LiPo, USB-C PD, Solar
- **Relays**: 4x 10A/120V

### Buddy (Plant Probe)
- **MCU**: nRF52832 (Bluetooth 5.2)
- **LoRa**: E22-900M30S (SX1262, 915MHz)
- **Sensors**: Capacitive moisture, DS18B20, EC
- **Power**: LIR2450 coin cell (1+ years)
- **Rating**: IP68

## 📱 PWA Features

- **Offline Support**: Service worker caching
- **Installable**: Add to home screen
- **Push Notifications**: Real-time alerts
- **Responsive**: Works on all screen sizes
- **Dark Mode**: System preference support

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing`)
5. Open a Pull Request

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [PlatformIO](https://platformio.org/) - Embedded development
- [TimescaleDB](https://www.timescale.com/) - Time-series database
- [Mosquitto](https://mosquitto.org/) - MQTT broker
- [shadcn/ui](https://ui.shadcn.com/) - UI components

## 📞 Support

- Documentation: [DEPLOYMENT.md](DEPLOYMENT.md)
- Issues: [GitHub Issues](https://github.com/yourusername/growos/issues)
- Email: support@growos.com

---

Built with ❤️ for growers everywhere.
