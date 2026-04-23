#!/bin/bash

echo "======================================"
echo "    MySQL Root Password Reset Script"
echo "======================================"
echo ""

# 1. Stop MySQL via launchctl (this prevents it from auto-restarting)
echo "1. Stopping macOS MySQL service..."
launchctl unload -w /Library/LaunchDaemons/com.oracle.oss.mysql.mysqld.plist 2>/dev/null
killall mysqld 2>/dev/null
sleep 3

# 2. Start MySQL in safe mode
echo "2. Starting MySQL in safe mode (no password required)..."
/usr/local/mysql/bin/mysqld_safe --skip-grant-tables > /dev/null 2>&1 &

# Wait for it to boot up
echo "   Waiting for safe mode to initialize..."
sleep 5

# 3. Reset password
echo "3. Resetting root password to 'fangyang6579'..."
/usr/local/mysql/bin/mysql -u root -e "FLUSH PRIVILEGES; ALTER USER 'root'@'localhost' IDENTIFIED BY 'fangyang6579';"

if [ $? -eq 0 ]; then
    echo "   Password successfully updated!"
else
    echo "   Failed to update password. Please check the logs."
fi

# 4. Stop safe mode server
echo "4. Stopping safe mode server..."
killall mysqld 2>/dev/null
sleep 4

# 5. Start normal server via launchctl
echo "5. Restarting normal macOS MySQL service..."
launchctl load -w /Library/LaunchDaemons/com.oracle.oss.mysql.mysqld.plist

echo ""
echo "======================================"
echo "Done! The new password is: fangyang6579"
echo "======================================"
