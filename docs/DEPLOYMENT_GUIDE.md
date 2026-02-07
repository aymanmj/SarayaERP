# 📚 Saraya ERP - Deployment Guide
# دليل تثبيت ونشر نظام السرايا

---

## 📋 Table of Contents

1. [Server Requirements](#server-requirements)
2. [Fresh Installation](#fresh-installation)
3. [Manual Updates](#manual-updates)
4. [Automatic Updates](#automatic-updates)
5. [Backup & Restore](#backup--restore)
6. [Remote Access](#remote-access)
7. [Troubleshooting](#troubleshooting)
8. [Useful Commands](#useful-commands)

---

## 🖥️ Server Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| OS | Ubuntu Server 22.04/24.04 | Ubuntu Server 24.04 LTS |
| RAM | 4 GB | 8 GB |
| Storage | 20 GB | 50 GB SSD |
| CPU | 2 cores | 4 cores |

---

## 🚀 Fresh Installation

### Step 1: Prepare Server

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Create installation directory
sudo mkdir -p /opt/saraya-erp
cd /opt/saraya-erp
```

### Step 2: Download and Run Installer

```bash
# Download install script
sudo curl -fsSL https://raw.githubusercontent.com/aymanmj/SarayaERP/main/scripts/install.sh -o install.sh

# Make executable
sudo chmod +x install.sh

# Run installer
sudo ./install.sh
```

### Step 3: Follow Interactive Prompts

The installer will ask for:
1. **Client Name** - For identification (e.g., "hospital-riyadh")
2. **Tailscale Auth Key** - Optional, for remote access
3. **Tailscale Hostname** - Optional, custom hostname
4. **GitHub Token** - For pulling private images
5. **License File Path** - Optional, skip if activating later

### Step 4: Verify Installation

```bash
# Check services status
docker compose -f docker-compose.production.yml ps

# Check backend health
curl -s http://localhost:3000/api/health | jq .
```

### Step 5: Access System

| Service | URL |
|---------|-----|
| Web App | `http://<SERVER_IP>` |
| Portainer | `http://<SERVER_IP>:9000` |
| Grafana | `http://<SERVER_IP>:3001` |

---

## 🔄 Manual Updates

### Method 1: SSH + update.sh (Recommended)

```bash
# Connect to server
ssh ubuntu@<SERVER_IP>

# Navigate to installation
cd /opt/saraya-erp

# Run interactive update menu
./scripts/update.sh

# Or run immediate update
./scripts/update.sh update
```

### Method 2: Portainer Web UI

1. Open `http://<SERVER_IP>:9000`
2. Go to **Containers**
3. Select container (e.g., `saraya_backend`)
4. Click **Recreate**
5. Check ✓ **Pull latest image**
6. Click **Recreate**

Repeat for: `saraya_backend`, `saraya_frontend`

### Method 3: Watchtower API

```bash
# Trigger immediate update via API
curl -X POST "http://<SERVER_IP>:8080/v1/update" \
     -H "Authorization: Bearer <WATCHTOWER_TOKEN>"
```

> **Note:** Get WATCHTOWER_TOKEN from `/opt/saraya-erp/.env.production`

### Method 4: Direct Docker Commands

```bash
cd /opt/saraya-erp

# Pull latest images
docker compose -f docker-compose.production.yml --env-file .env.production pull backend frontend

# Recreate containers with new images
docker compose -f docker-compose.production.yml --env-file .env.production up -d backend frontend

# Verify
docker compose -f docker-compose.production.yml ps
```

---

## ⏰ Automatic Updates

### Schedule (Pre-configured)

| Time | Task | Log File |
|------|------|----------|
| 2:00 AM | Backup | `/var/log/saraya-backup.log` |
| 3:00 AM | Update | `/var/log/saraya-update.log` |

### View Cron Jobs

```bash
cat /etc/cron.d/saraya-update
cat /etc/cron.d/saraya-backup
```

### Disable Automatic Updates

```bash
sudo rm /etc/cron.d/saraya-update
```

### Re-enable Automatic Updates

```bash
cat > /etc/cron.d/saraya-update << 'EOF'
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin

0 3 * * * root /opt/saraya-erp/scripts/auto-update.sh >> /var/log/saraya-update.log 2>&1
EOF
chmod 644 /etc/cron.d/saraya-update
```

---

## 💾 Backup & Restore

### Manual Backup

```bash
cd /opt/saraya-erp
./scripts/backup.sh
```

### Backup Location

```
/opt/saraya-erp/backups/
├── saraya_backup_2026-02-07_020000.sql.gz
├── saraya_backup_2026-02-06_020000.sql.gz
└── ...
```

### Restore from Backup

```bash
cd /opt/saraya-erp

# Stop backend
docker compose -f docker-compose.production.yml stop backend

# Restore database
gunzip -c backups/saraya_backup_YYYY-MM-DD_HHMMSS.sql.gz | \
  docker exec -i saraya_db psql -U admin -d saraya_erp

# Start backend
docker compose -f docker-compose.production.yml start backend
```

---

## 🔗 Remote Access

### Option 1: Direct SSH (Requires VPN/Port Forwarding)

```bash
ssh ubuntu@<PUBLIC_IP>
```

### Option 2: Tailscale (Recommended)

1. **Install Tailscale on your laptop:**
   - Windows: Download from https://tailscale.com/download
   - Run installer and login to Tailscale

2. **Connect to server:**
   ```bash
   ssh ubuntu@<TAILSCALE_HOSTNAME>
   ```

3. **Access web interfaces:**
   - Web App: `http://<TAILSCALE_HOSTNAME>`
   - Portainer: `http://<TAILSCALE_HOSTNAME>:9000`

### Option 3: Portainer (Web-based)

If port 9000 is accessible:
1. Open `http://<SERVER_IP>:9000`
2. Login with your Portainer credentials
3. Manage containers, view logs, restart services

---

## 🔧 Troubleshooting

### Backend Not Starting

```bash
# Check logs
docker logs saraya_backend --tail 100

# Common fix: Database credentials mismatch
docker compose -f docker-compose.production.yml down -v
sudo rm -rf postgres_data
docker compose -f docker-compose.production.yml up -d
```

### Database Connection Failed

```bash
# Verify credentials match
grep POSTGRES_PASSWORD .env.production
grep DATABASE_URL .env.production

# Ensure POSTGRES_USER matches
grep POSTGRES_USER .env.production
```

### Services Not Starting After Reboot

```bash
# Check systemd service
sudo systemctl status saraya-erp

# Re-enable if needed
sudo systemctl enable saraya-erp
sudo systemctl start saraya-erp
```

### Disk Space Issues

```bash
# Check disk usage
df -h

# Clean old Docker images
docker image prune -a -f

# Clean old backups (keep last 7)
find /opt/saraya-erp/backups -name "*.sql.gz" -mtime +7 -delete
```

---

## 📝 Useful Commands

### Service Management

```bash
# Check status
docker compose -f docker-compose.production.yml ps

# View logs
docker compose -f docker-compose.production.yml logs -f
docker compose -f docker-compose.production.yml logs -f backend

# Restart all
docker compose -f docker-compose.production.yml restart

# Restart specific service
docker compose -f docker-compose.production.yml restart backend

# Stop all
docker compose -f docker-compose.production.yml down

# Start all
docker compose -f docker-compose.production.yml up -d
```

### Quick Diagnostics

```bash
# System resources
htop

# Docker disk usage
docker system df

# Container resource usage
docker stats

# Backend health check
curl -s http://localhost:3000/api/health | jq .
```

### View Credentials

```bash
# View all environment variables
cat /opt/saraya-erp/.env.production

# View specific credential
grep JWT_SECRET /opt/saraya-erp/.env.production
grep POSTGRES_PASSWORD /opt/saraya-erp/.env.production
```

---

## 📞 Support

For technical support:
- Developer: Eng. Ayman Jaballa
- GitHub: https://github.com/aymanmj/SarayaERP

---

*Last Updated: February 2026*
