# scripts/setup.sh
#!/bin/bash

# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 18.x
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2
sudo npm install -g pm2

# Create app directory
mkdir -p ~/urban-forest-flows

# Start app with PM2
cd ~/urban-forest-flows
pm2 start dist/main.js --name urban-forest-api
pm2 save

# Setup PM2 to start on boot
pm2 startup