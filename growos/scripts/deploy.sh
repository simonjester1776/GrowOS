#!/bin/bash

# GrowOS Deployment Script
# Usage: ./deploy.sh [environment]
# Environments: local, staging, production

set -e

ENVIRONMENT=${1:-local}
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "🌱 GrowOS Deployment Script"
echo "Environment: $ENVIRONMENT"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Helper functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check dependencies
check_dependencies() {
    log_info "Checking dependencies..."
    
    command -v docker >/dev/null 2>&1 || { log_error "Docker is required but not installed."; exit 1; }
    command -v docker-compose >/dev/null 2>&1 || { log_error "Docker Compose is required but not installed."; exit 1; }
    
    log_info "All dependencies found"
}

# Load environment variables
load_env() {
    if [ -f "$PROJECT_DIR/.env.$ENVIRONMENT" ]; then
        log_info "Loading environment variables from .env.$ENVIRONMENT"
        export $(grep -v '^#' "$PROJECT_DIR/.env.$ENVIRONMENT" | xargs)
    elif [ -f "$PROJECT_DIR/.env" ]; then
        log_info "Loading environment variables from .env"
        export $(grep -v '^#' "$PROJECT_DIR/.env" | xargs)
    else
        log_warn "No .env file found, using defaults"
    fi
}

# Create necessary directories
setup_directories() {
    log_info "Setting up directories..."
    
    mkdir -p "$PROJECT_DIR/data/postgres"
    mkdir -p "$PROJECT_DIR/data/mosquitto"
    mkdir -p "$PROJECT_DIR/data/redis"
    mkdir -p "$PROJECT_DIR/logs"
    mkdir -p "$PROJECT_DIR/firmware_files"
    
    # Set permissions
    chmod -R 755 "$PROJECT_DIR/data" 2>/dev/null || true
    
    log_info "Directories created"
}

# Database migrations
run_migrations() {
    log_info "Running database migrations..."
    
    cd "$PROJECT_DIR/backend"
    
    if [ "$ENVIRONMENT" = "local" ]; then
        npm run db:migrate
    else
        docker-compose -f "$PROJECT_DIR/docker-compose.yml" exec -T backend npm run db:migrate
    fi
    
    log_info "Migrations completed"
}

# Build images
build_images() {
    log_info "Building Docker images..."
    
    cd "$PROJECT_DIR"
    
    if [ "$ENVIRONMENT" = "local" ]; then
        docker-compose build
    else
        docker-compose -f docker-compose.yml -f "docker-compose.$ENVIRONMENT.yml" build
    fi
    
    log_info "Images built successfully"
}

# Deploy services
deploy() {
    log_info "Deploying services..."
    
    cd "$PROJECT_DIR"
    
    if [ "$ENVIRONMENT" = "local" ]; then
        docker-compose up -d
    else
        docker-compose -f docker-compose.yml -f "docker-compose.$ENVIRONMENT.yml" up -d
    fi
    
    log_info "Services deployed"
}

# Health check
health_check() {
    log_info "Running health checks..."
    
    local retries=30
    local wait=2
    local count=0
    
    while [ $count -lt $retries ]; do
        if curl -sf http://localhost:3000/health >/dev/null 2>&1; then
            log_info "Backend is healthy"
            return 0
        fi
        
        count=$((count + 1))
        log_warn "Waiting for backend... ($count/$retries)"
        sleep $wait
    done
    
    log_error "Health check failed"
    return 1
}

# Cleanup old resources
cleanup() {
    log_info "Cleaning up old resources..."
    
    # Remove unused images
    docker image prune -f >/dev/null 2>&1 || true
    
    # Remove stopped containers
    docker container prune -f >/dev/null 2>&1 || true
    
    log_info "Cleanup completed"
}

# Rollback on failure
rollback() {
    log_error "Deployment failed, rolling back..."
    
    cd "$PROJECT_DIR"
    docker-compose down
    
    log_warn "Rollback completed"
    exit 1
}

# Backup database
backup_database() {
    if [ "$ENVIRONMENT" = "production" ]; then
        log_info "Creating database backup..."
        
        BACKUP_DIR="$PROJECT_DIR/backups"
        mkdir -p "$BACKUP_DIR"
        
        BACKUP_FILE="$BACKUP_DIR/growos_$(date +%Y%m%d_%H%M%S).sql"
        
        docker-compose exec -T postgres pg_dump -U growos growos > "$BACKUP_FILE"
        
        # Keep only last 10 backups
        ls -t "$BACKUP_DIR"/*.sql | tail -n +11 | xargs rm -f 2>/dev/null || true
        
        log_info "Backup created: $BACKUP_FILE"
    fi
}

# Main deployment flow
main() {
    log_info "Starting deployment..."
    
    check_dependencies
    load_env
    setup_directories
    
    # Backup before deployment in production
    if [ "$ENVIRONMENT" = "production" ]; then
        backup_database
    fi
    
    # Build and deploy
    build_images
    deploy
    
    # Run migrations
    sleep 5
    run_migrations || rollback
    
    # Health check
    health_check || rollback
    
    # Cleanup
    cleanup
    
    log_info "✅ Deployment completed successfully!"
    echo ""
    echo "Services:"
    echo "  - API: http://localhost:3000"
    echo "  - Web: http://localhost"
    echo "  - MQTT: localhost:1883"
    echo ""
    
    if [ "$ENVIRONMENT" != "production" ]; then
        echo "API Documentation: http://localhost:3000/api-docs"
    fi
}

# Handle script interruption
trap 'log_error "Deployment interrupted"; exit 1' INT TERM

# Run main function
main
