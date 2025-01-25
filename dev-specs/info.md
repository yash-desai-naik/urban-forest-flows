Create whatsapp flows as json from playground
create a new flows and save/publish as a template


set webhook url

---

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

---

# /etc/nginx/sites-available/urban-forest-api
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}

---

# 1. Launch EC2 instance with Ubuntu
# 2. Connect to instance via SSH
ssh -i key.pem ubuntu@your-ec2-ip

# 3. Clone repository
git clone https://github.com/your-username/urban-forest-flows.git

# 4. Run setup script
bash scripts/setup.sh

# 5. Install and configure Nginx
sudo apt install nginx -y
sudo cp /path/to/nginx/config /etc/nginx/sites-available/urban-forest-api
sudo ln -s /etc/nginx/sites-available/urban-forest-api /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx

# 6. Setup SSL with Let's Encrypt
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d your-domain.com