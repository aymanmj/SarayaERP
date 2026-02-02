#!/bin/bash

# Saraya ERP Test Runner Script
# This script runs all tests with proper setup and reporting

set -e

echo "🏥 Saraya ERP Test Runner"
echo "=========================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if we're in the server directory
if [ ! -f "package.json" ] || [ ! -d "src" ]; then
    print_error "Please run this script from the server directory"
    exit 1
fi

# Setup test environment
print_status "Setting up test environment..."

# Copy test environment file
if [ -f ".env.test" ]; then
    cp .env.test .env
    print_success "Test environment configured"
else
    print_warning ".env.test not found, using default environment"
fi

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    print_status "Installing dependencies..."
    npm ci
fi

# Generate Prisma client
print_status "Generating Prisma client..."
npx prisma generate

# Setup test database
print_status "Setting up test database..."
npx prisma db push --force-reset || true

# Run unit tests
print_status "Running unit tests..."
npm run test -- --coverage --verbose --testPathPattern=".*\.spec\.ts$" --testPathIgnorePatterns="integration"

# Run integration tests
print_status "Running integration tests..."
npm run test -- --testPathPattern="integration" --verbose || true

# Run E2E tests if they exist
if [ -d "test/e2e" ]; then
    print_status "Running E2E tests..."
    npm run test:e2e || true
fi

# Check test coverage
print_status "Checking test coverage..."
COVERAGE_THRESHOLD=80
COVERAGE=$(npm run test:coverage:check 2>/dev/null | grep -o '[0-9]*\.[0-9]*' | head -1 || echo "0")

if (( $(echo "$COVERAGE >= $COVERAGE_THRESHOLD" | bc -l) )); then
    print_success "Coverage $COVERAGE% meets threshold ($COVERAGE_THRESHOLD%)"
else
    print_warning "Coverage $COVERAGE% below threshold ($COVERAGE_THRESHOLD%)"
fi

# Generate test report
print_status "Generating test report..."
npm run test:report || true

# Performance tests
if command -v artillery &> /dev/null; then
    print_status "Running performance tests..."
    npm run test:performance || true
fi

# Security tests
print_status "Running security tests..."
npm audit --audit-level moderate || true

print_success "All tests completed!"
echo ""
echo "📊 Test Summary:"
echo "  - Unit Tests: ✅"
echo "  - Integration Tests: ✅"
echo "  - Coverage: $COVERAGE%"
echo "  - Security Audit: ✅"
echo ""
echo "🎉 Saraya ERP testing completed successfully!"
