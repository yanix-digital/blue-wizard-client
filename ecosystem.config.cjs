module.exports = {
  apps: [
    {
      name: "bw",
      script: "./index.js",
      env: {
        NODE_ENV: "development",
      },
      env_production: {
        NODE_ENV: "production",
      },
      cron_restart: "*/120 * * * *", // 2 hours
    },
  ],
};
