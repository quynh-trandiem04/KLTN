module.exports = {
  apps: [
    // 1. BLOCKCHAIN ADAPTER
    {
      name: "1-ADAPTER",
      script: "./src/app.js",
      cwd: "./blockchain-adapter",
      env: { PORT: 3000 }
    },
    
    // 2. BLOCK LISTENER (Worker)
    {
      name: "2-LISTENER",
      script: "./src/listeners/blockListener.js",
      cwd: "./blockchain-adapter",
      watch: false
    },
    // 3. BACKEND API
    {
      name: "3-BACKEND",
      script: "./src/app.js",
      cwd: "./backend-api",
      watch: true,
      env: { PORT: 4000 }
    },
    // 4. FRONTEND
    {
      name: "4-FRONTEND",
      script: "node_modules/next/dist/bin/next", 
      args: "dev",
      cwd: "./frontend-app",
      interpreter: "node",
      watch: false,
      env: {
        PORT: 3001
      }
    }
  ]
};