#!/bin/bash

# GrowOS Backup Script
# Usage: ./backup.sh [full|data|config]

set -e

BACKUP_TYPE=${1:-full}
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BACKUP_DIR="$PROJECT_DIR/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

echo "🌱 GrowOS Backup Script"
echo "Type: $BACKUP_TYPE"
echo "Timestamp: $TIMESTAMP"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
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

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Backup database
backup_database() {
    log_info "Backing up database..."
    
    DB_BACKUP="$BACKUP_DIR/db_${TIMESTAMP}.sql"
    
    if docker-compose ps postgres | grep -q "Up"; then
        docker-compose exec -T postgres pg_dump -U growos growos > "$DB_BACKUP"
        gzip "$DB_BACKUP"
        log_info "Database backup created: ${DB_BACKUP}.gz"
    else
        log_warn "PostgreSQL container not running, skipping database backup"
    fi
}

# Backup configuration
backup_config() {
    log_info "Backing up configuration..."
    
    CONFIG_BACKUP="$BACKUP_DIR/config_${TIMESTAMP}.tar.gz"
    
    tar -czf "$CONFIG_BACKUP" \
        -C "$PROJECT_DIR" \
        .env \
        .env.* \
        backend/config/ \
        2>/dev/null || true
    
    log_info "Configuration backup created: $CONFIG_BACKUP"
}

# Backup firmware files
backup_firmware() {
    log_info "Backing up firmware files..."
    
    if [ -d "$PROJECT_DIR/firmware_files" ]; then
        FIRMWARE_BACKUP="$BACKUP_DIR/firmware_${TIMESTAMP}.tar.gz"
        tar -czf "$FIRMWARE_BACKUP" -C "$PROJECT_DIR" firmware_files/
        log_info "Firmware backup created: $FIRMWARE_BACKUP"
    else
        log_warn "No firmware files to backup"
    fi
}

# Full backup
backup_full() {
    log_info "Creating full backup..."
    
    backup_database
    backup_config
    backup_firmware
    
    # Create combined archive
    FULL_BACKUP="$BACKUP_DIR/full_${TIMESTAMP}.tar.gz"
    tar -czf "$FULL_BACKUP" -C "$BACKUP_DIR" \
        db_${TIMESTAMP}.sql.gz \
        config_${TIMESTAMP}.tar.gz \
        2>/dev/null || true
    
    log_info "Full backup created: $FULL_BACKUP"
}

# Cleanup old backups
cleanup_old_backups() {
    log_info "Cleaning up old backups..."
    
    # Keep last 30 days of backups
    find "$BACKUP_DIR" -name "*.tar.gz" -mtime +30 -delete 2>/dev/null || true
    find "$BACKUP_DIR" -name "*.sql.gz" -mtime +30 -delete 2>/dev/null || true
    
    log_info "Old backups cleaned up"
}

# Upload to remote storage (optional)
upload_to_remote() {
    if [ -n "$S3_BUCKET" ]; then
        log_info "Uploading to S3..."
        
        aws s3 sync "$BACKUP_DIR" "s3://$S3_BUCKET/backups/" \
            --exclude "*" \
            --include "*_${TIMESTAMP}*" \
            --storage-class STANDARD_IA
        
        log_info "Upload completed"
    fi
}

# Main
main() {
    cd "$PROJECT_DIR"
    
    case $BACKUP_TYPE in
        full)
            backup_full
            ;;
        data)
            backup_database
            ;;
        config)
            backup_config
            ;;
        firmware)
            backup_firmware
            ;;
        *)
            echo "Usage: $0 [full|data|config|firmware]"
            exit 1
            ;;
    esac
    
    cleanup_old_backups
    upload_to_remote
    
    log_info "✅ Backup completed successfully!"
    echo ""
    echo "Backup location: $BACKUP_DIR"
    ls -lh "$BACKUP_DIR"/*_${TIMESTAMP}* 2>/dev/null || true
}

main
