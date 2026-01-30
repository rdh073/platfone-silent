---
description: How to setup and deploy a private Verdaccio registry on Server 185
---

# Deploy Private Verdaccio Registry

This workflow describes how to set up `verdaccio` as a private NPM registry on your target server (Server 185).

## 1. Requirement Check
Ensure you are logged into Server 185 and have `sudo` access.
```bash
node -v # Should be v14+
npm -v
```

## 2. Global Installation
// turbo
install verdaccio globally
```bash
sudo npm install -g verdaccio
```

## 3. Prepare Configuration (Optional)
If you need persistent storage, create a config directory:
```bash
mkdir -p ~/.verdaccio
# You can perform custom config editing here if needed
```

## 4. Start Server
Run verdaccio listening on all interfaces (or specific IP) so it's accessible.
```bash
# Recommended: Run in background or use pm2 using: "pm2 start verdaccio"
verdaccio --listen 0.0.0.0:4873
```

## 5. Client Configuration (On Your Local Machine)
Once the server is running on `http://185.x.x.x:4873`, configure your local project to use it.

### Create User
```bash
npm adduser --registry http://185.185.80.116:4873
```

### Publish Package
```bash
npm publish --registry http://185.185.80.116:4873
```

### (Optional) Project-Level Config
Create a `.npmrc` file in your project root to force this scope to the private registry:
```ini
registry=http://185.185.80.116:4873/
# Or scoped:
# @my-scope:registry=http://185.185.80.116:4873/
```
