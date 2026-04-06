#!/bin/bash

# GrowOS Setup Script
# Usage: ./setup.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "🌱 GrowOS Setup Script"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_step() {
    echo -e "${BLUE}[STEP]${NC} $1"
}

# Check if running as root
check_root() {
    if [ "$EUID" -eq 0 ]; then
        log_error "Please do not run as root"
        exit 1
    fi
}

# Check OS
check_os() {
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        OS="linux"
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        OS="macos"
    else
        log_error "Unsupported operating system: $OSTYPE"
        exit 1
    fi
    
    log_info "Detected OS: $OS"
}

# Check and install dependencies
install_dependencies() {
    log_step "Checking dependencies..."
    
    # Check Docker
    if ! command -v docker &> /dev/null; then
        log_warn "Docker not found. Please install Docker first."
        echo "  Linux: https://docs.docker.com/engine/install/"
        echo "  macOS: https://docs.docker.com/desktop/install/mac-install/"
        exit 1
    fi
    
    # Check Docker Compose
    if ! command -v docker-compose &> /dev/null; then
        log_warn "Docker Compose not found. Please install Docker Compose."
        exit 1
    fi
    
    # Check Node.js (for local development)
    if ! command -v node &> /dev/null; then
        log_warn "Node.js not found. It's recommended for development."
    else
        NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
        if [ "$NODE_VERSION" -lt 18 ]; then
            log_warn "Node.js version should be 18 or higher"
        fi
    fi
    
    log_info "All required dependencies found"
}

# Create environment files
create_env_files() {
    log_step "Creating environment files..."
    
    cd "$PROJECT_DIR"
    
    # Main .env file
    if [ ! -f .env ]; then
        cat > .env << EOF
# GrowOS Environment Configuration
NODE_ENV=development

# Database
DATABASE_URL=postgresql://growos:growos_dev@localhost:5432/growos

# MQTT
MQTT_HOST=localhost
MQTT_PORT=1883
MQTT_USERNAME=
MQTT_PASSWORD=

# Authentication
JWT_SECRET=$(openssl rand -hex 32)
JWT_EXPIRES_IN=7d

# API
PORT=3000
API_URL=http://localhost:3000

# Client
CLIENT_URL=http://localhost:5173

# Redis (optional)
REDIS_URL=

# Logging
LOG_LEVEL=info

# Firmware
FIRMWARE_PATH=./firmware_files
EOF
        log_info "Created .env file"
    else
        log_warn ".env file already exists, skipping"
    fi
    
    # Backend .env
    if [ ! -f backend/.env ]; then
        cp .env backend/.env
        log_info "Created backend/.env"
    fi
}

# Create necessary directories
create_directories() {
    log_step "Creating directories..."
    
    mkdir -p "$PROJECT_DIR/data/postgres"
    mkdir -p "$PROJECT_DIR/data/mosquitto"
    mkdir -p "$PROJECT_DIR/data/redis"
    mkdir -p "$PROJECT_DIR/logs"
    mkdir -p "$PROJECT_DIR/backups"
    mkdir -p "$PROJECT_DIR/firmware_files/guardian"
    mkdir -p "$PROJECT_DIR/firmware_files/buddy"
    
    log_info "Directories created"
}

# Setup Mosquitto config
setup_mosquitto() {
    log_step "Setting up Mosquitto configuration..."
    
    mkdir -p "$PROJECT_DIR/data/mosquitto/config"
    
    if [ ! -f "$PROJECT_DIR/data/mosquitto/config/mosquitto.conf" ]; then
        cat > "$PROJECT_DIR/data/mosquitto/config/mosquitto.conf" << EOF
listener 1883
listener 9001

persistence true
persistence_location /mosquitto/data/

log_dest file /mosquitto/log/mosquitto.log
log_dest stdout

allow_anonymous true

max_connections 100
max_inflight_messages 40
max_queued_messages 200

autosave_interval 900
EOF
        log_info "Created Mosquitto configuration"
    fi
}

# Install backend dependencies
install_backend_deps() {
    log_step "Installing backend dependencies..."
    
    cd "$PROJECT_DIR/backend"
    
    if [ -f package.json ]; then
        npm install
        log_info "Backend dependencies installed"
    else
        log_warn "Backend package.json not found"
    fi
}

# Install frontend dependencies
install_frontend_deps() {
    log_step "Installing frontend dependencies..."
    
    cd "$PROJECT_DIR/web"
    
    if [ -f package.json ]; then
        npm install
        log_info "Frontend dependencies installed"
    else
        log_warn "Frontend package.json not found"
    fi
}

# Make scripts executable
make_scripts_executable() {
    log_step "Setting up scripts..."
    
    chmod +x "$PROJECT_DIR/scripts/"*.sh 2>/dev/null || true
    
    log_info "Scripts made executable"
}

# Print next steps
print_next_steps() {
    echo ""
    echo "✅ Setup completed successfully!"
    echo ""
    echo "Next steps:"
    echo ""
    echo "1. Review and edit the .env file:"
    echo "   nano .env"
    echo ""
    echo "2. Start the services:"
    echo "   docker-compose up -d"
    echo ""
    echo "3. Run database migrations:"
    echo "   cd backend && npm run db:migrate"
    echo ""
    echo "4. Start the backend (development):"
    echo "   cd backend && npm run dev"
    echo ""
    echo "5. Start the frontend (development):"
    echo "   cd web && npm run dev"
    echo ""
    echo "Or use the deployment script:"
    echo "   ./scripts/deploy.sh local"
    echo ""
    echo "Services will be available at:"
    echo "  - Web Dashboard: http://localhost:5173"
    echo "  - API: http://localhost:3000"
    echo "  - MQTT: localhost:1883"
    echo ""
}

# Main
main() {
    check_root
    check_os
    install_dependencies
    create_env_files
    create_directories
    setup_mosquitto
    install_backend_deps
    install_frontend_deps
    make_scripts_executable
    print_next_steps
}

main
