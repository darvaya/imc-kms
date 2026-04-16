module.exports = {
  apps: [
    {
      name: "kms",
      script: "./build/server/index.js",
      cwd: __dirname,
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
      },
      max_restarts: 10,
      min_uptime: "10s",
      restart_delay: 5000,
      error_file: "./logs/kms-error.log",
      out_file: "./logs/kms-out.log",
      merge_logs: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      watch: false,
    },
  ],
};
