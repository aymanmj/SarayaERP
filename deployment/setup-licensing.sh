#!/bin/bash
# Saraya ERP - Client Licensing Utility
# Run this to get the Hardware ID for the admin.

echo "==============================================="
echo "   🏥 Saraya ERP - License Request Tool       "
echo "==============================================="

# Get Hardware ID (Cross-platform)
if [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "win32" ]]; then
    ID=$(powershell.exe -Command "(Get-CimInstance Win32_ComputerSystemProduct).UUID" | tr -d '\r')
else
    ID=$(cat /etc/machine-id 2>/dev/null || hostname)
fi

echo ""
echo "Please send this ID to the Saraya ERP Administrator:"
echo ""
echo "   👉  $ID"
echo ""
echo "After receiving the 'saraya.lic' file, place it in the 'E:\\SarayaERP' folder."
echo "==============================================="
read -p "Press Enter to exit..."
