# GrowOS Production Deployment Guide

This guide covers deploying GrowOS in a production environment.

## 📋 Prerequisites

- Docker 24.0+ and Docker Compose 2.20+
- 4GB RAM minimum (8GB recommended)
- 20GB disk space
- Linux server (Ubuntu 22.04 LTS recommended)
- Domain name (optional but recommended)
- SSL certificate (Let's Encrypt recommended)

## 🚀 Quick Start

### 1. Clone and Setup

```bash
git clone https://github.com/yourusername/growos.git
cd growos
./scripts/setup.sh
```

### 2. Configure Environment

```bash
cp .env.example .env
nano .env
```

Update these critical settings:

```env
NODE_ENV=production
JWT_SECRET=your-super-secret-key-here-min-32-chars
DATABASE_URL=postgresql://growos:strong-password@postgres:5432/growos
```

### 3. Deploy

```bash
./scripts/deploy.sh production
```

## 🔧 Detailed Configuration

### Database

PostgreSQL with TimescaleDB is used for time-series data:

```env
POSTGRES_USER=growos
POSTGRES_PASSWORD=your-strong-password
POSTGRES_DB=growos
```

### MQTT Broker

Mosquitto is pre-configured for anonymous access in development. For production:

1. Enable authentication in `backend/config/mosquitto.conf`:

```conf
allow_anonymous false
password_file /mosquitto/config/passwd
acl_file /mosquitto/config/acl
```

2. Create password file:

```bash
docker-compose exec mosquitto mosquitto_passwd -c /mosquitto/config/passwd growos
```

### SSL/TLS

#### Option 1: Let's Encrypt (Recommended)

```bash
# Enable SSL profile
docker-compose -f docker-compose.yml -f docker-compose.production.yml --profile ssl up -d
```

#### Option 2: Custom Certificates

Place certificates in `nginx/ssl/`:

```
nginx/ssl/
├── fullchain.pem
└── privkey.pem
```

### Redis Caching

Redis is automatically configured for caching. To disable:

```env
REDIS_URL=
```

## 📊 Monitoring

### Health Checks

- API Health: `GET /health`
- Readiness: `GET /ready`
- Liveness: `GET /live`

### Logs

```bash
# View all logs
docker-compose logs -f

# View specific service
docker-compose logs -f backend

# View last 100 lines
docker-compose logs --tail=100 backend
```

### Metrics

System statistics (admin only):

```bash
GET /api/v1/system/stats
```

## 💾 Backup and Recovery

### Automated Backups

Set up cron job for daily backups:

```bash
# Edit crontab
crontab -e

# Add line for daily backup at 2 AM
0 2 * * * /path/to/growos/scripts/backup.sh full
```

### Manual Backup

```bash
# Full backup
./scripts/backup.sh full

# Database only
./scripts/backup.sh data

# Configuration only
./scripts/backup.sh config
```

### Restore from Backup

```bash
# Stop services
docker-compose down

# Restore database
gunzip < backups/db_YYYYMMDD_HHMMSS.sql.gz | docker-compose exec -T postgres psql -U growos

# Restore configuration
tar -xzf backups/config_YYYYMMDD_HHMMSS.tar.gz

# Start services
docker-compose up -d
```

## 🔒 Security

### Firewall

```bash
# UFW example
sudo ufw default deny incoming
sudo ufw allow ssh
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 1883/tcp  # MQTT (restrict to device IPs if possible)
sudo ufw enable
```

### Fail2ban

Install fail2ban to prevent brute force attacks:

```bash
sudo apt install fail2ban
```

Create `/etc/fail2ban/jail.local`:

```ini
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 5

[growos-api]
enabled = true
port = http,https
filter = growos
logpath = /var/log/growos/backend.log
maxretry = 5
```

### JWT Secret

Generate a strong JWT secret:

```bash
openssl rand -hex 32
```

## 🔄 Updates

### Update Application

```bash
# Pull latest changes
git pull origin main

# Rebuild and deploy
./scripts/deploy.sh production
```

### Database Migrations

```bash
cd backend
npm run db:migrate
```

## 🐛 Troubleshooting

### Services Won't Start

```bash
# Check logs
docker-compose logs

# Check disk space
df -h

# Check memory
free -h
```

### Database Connection Issues

```bash
# Test database connection
docker-compose exec postgres pg_isready -U growos

# View database logs
docker-compose logs postgres
```

### MQTT Connection Issues

```bash
# Test MQTT
docker-compose exec mosquitto mosquitto_pub -t test -m "test"

# View MQTT logs
docker-compose logs mosquitto
```

### Reset Everything

**⚠️ WARNING: This will delete all data!**

```bash
docker-compose down -v
rm -rf data/
./scripts/setup.sh
```

## 📈 Scaling

### Horizontal Scaling

For high availability, deploy multiple backend instances behind a load balancer:

```yaml
# docker-compose.scale.yml
services:
  backend:
    deploy:
      replicas: 3
```

### Database Replication

For read-heavy workloads, set up PostgreSQL read replicas:

```bash
# Primary
docker-compose exec postgres pg_basebackup -D /backup -Fp -Xs -P -v

# Replica
docker run -d --name postgres-replica \
  -e POSTGRES_USER=growos \
  -e POSTGRES_PASSWORD=password \
  -v postgres_replica_data:/var/lib/postgresql/data \
  timescale/timescaledb:latest-pg16
```

## 🌐 Domain Configuration

### DNS Records

```
A     growos.example.com     YOUR_SERVER_IP
A     api.growos.example.com YOUR_SERVER_IP
CNAME mqtt.growos.example.com growos.example.com
```

### Nginx Configuration

Update `nginx/nginx.conf` with your domain:

```nginx
server {
    listen 443 ssl http2;
    server_name growos.example.com;
    
    ssl_certificate /etc/letsencrypt/live/growos.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/growos.example.com/privkey.pem;
    
    # ... rest of config
}
```

## 📞 Support

For support, please:

1. Check the logs: `docker-compose logs`
2. Review this guide
3. Open an issue on GitHub
4. Contact support@growos.com

## 📚 Additional Resources

- [API Documentation](/api-docs) (when running locally)
- [Architecture Overview](README.md#architecture)
- [Contributing Guide](CONTRIBUTING.md)
