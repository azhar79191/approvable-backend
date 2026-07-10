import dotenv from "dotenv";

dotenv.config();

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 4000),
  clientUrl: required("CLIENT_URL", "http://localhost:3000"),
  apiUrl: required("API_URL", "http://localhost:4000/api"),

  databaseUrl: required("DATABASE_URL"),
  redisUrl: required("REDIS_URL", "redis://localhost:6379"),

  jwt: {
    accessSecret: required("JWT_ACCESS_SECRET"),
    refreshSecret: required("JWT_REFRESH_SECRET"),
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? "15m",
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? "7d",
  },

  google: {
    clientId: process.env.GOOGLE_CLIENT_ID ?? "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    callbackUrl: process.env.GOOGLE_CALLBACK_URL ?? "",
  },

  smtp: {
    host: process.env.SMTP_HOST ?? "",
    port: Number(process.env.SMTP_PORT ?? 587),
    user: process.env.SMTP_USER ?? "",
    pass: process.env.SMTP_PASS ?? "",
    from: process.env.EMAIL_FROM ?? "no-reply@example.com",
  },

  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME ?? "",
    apiKey: process.env.CLOUDINARY_API_KEY ?? "",
    apiSecret: process.env.CLOUDINARY_API_SECRET ?? "",
  },

  cookieSecret: process.env.COOKIE_SECRET ?? "dev-cookie-secret",
  socialCredsKey: process.env.SOCIAL_CREDS_KEY ?? "",

  oauth: {
    facebook:  { clientId: process.env.FACEBOOK_CLIENT_ID ?? "",  clientSecret: process.env.FACEBOOK_CLIENT_SECRET ?? "" },
    twitter:   { clientId: process.env.TWITTER_CLIENT_ID ?? "",   clientSecret: process.env.TWITTER_CLIENT_SECRET ?? "" },
    linkedin:  { clientId: process.env.LINKEDIN_CLIENT_ID ?? "",  clientSecret: process.env.LINKEDIN_CLIENT_SECRET ?? "" },
    tiktok:    { clientId: process.env.TIKTOK_CLIENT_ID ?? "",    clientSecret: process.env.TIKTOK_CLIENT_SECRET ?? "" },
    youtube:   { clientId: process.env.YOUTUBE_CLIENT_ID ?? "",   clientSecret: process.env.YOUTUBE_CLIENT_SECRET ?? "" },
    pinterest: { clientId: process.env.PINTEREST_CLIENT_ID ?? "", clientSecret: process.env.PINTEREST_CLIENT_SECRET ?? "" },
  },

  isProd: process.env.NODE_ENV === "production",
};
