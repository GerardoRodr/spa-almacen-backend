export const configuration = () => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
  database: {
    url: process.env.DATABASE_URL,
  },
  jwt: {
    secret: process.env.JWT_SECRET ?? 'super-secret-key-cambiar-en-produccion',
    refreshSecret: process.env.JWT_REFRESH_SECRET ?? 'super-refresh-key-cambiar-en-produccion',
    expiresIn: process.env.JWT_EXPIRES_IN ?? '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
  },
  uploads: {
    dir: process.env.UPLOAD_DIR ?? './uploads',
  },
});
