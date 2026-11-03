import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { admin } from "better-auth/plugins";
import { passkey } from "@better-auth/passkey";
import { APIError } from "better-auth/api";
import { prisma } from "./db";
import { authConfig } from "./auth-config";

function createAuth() {
  const config = authConfig();
  return betterAuth({
    appName: "Jeffventory",
    baseURL: config.origin,
    secret: config.secret,
    database: prismaAdapter(prisma, { provider: "sqlite" }),
    trustedOrigins: [config.origin],
    emailAndPassword: { enabled: true, disableSignUp: true, minPasswordLength: 12, maxPasswordLength: 128 },
    session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24, freshAge: 60 * 10, cookieCache: { enabled: false } },
    advanced: {
      useSecureCookies: config.secure,
      // The route supplies this fixed bucket; clients cannot evade limits with X-Forwarded-For.
      ipAddress: { ipAddressHeaders: ["x-jeffventory-auth-bucket"] },
    },
    rateLimit: {
      enabled: true, storage: "database", window: 60, max: 120,
      customRules: {
        "/sign-in/email": { window: 60, max: 10 },
        "/passkey/generate-authenticate-options": { window: 60, max: 20 },
        "/passkey/verify-authentication": { window: 60, max: 20 },
      },
    },
    plugins: [
      admin(),
      passkey({
        rpName: "Jeffventory", rpID: config.rpID, origin: config.origin,
        authenticatorSelection: { residentKey: "required", userVerification: "required" },
        registration: {
          requireSession: true,
          afterVerification: async ({ verification }) => {
            if (!verification.registrationInfo?.userVerified) throw new APIError("FORBIDDEN", { message: "Verify your identity on your device." });
          },
        },
        authentication: {
          afterVerification: async ({ verification }) => {
            if (!verification.authenticationInfo.userVerified) throw new APIError("FORBIDDEN", { message: "Verify your identity on your device." });
          },
        },
      }),
    ],
  });
}

// Defer configuration until a request/CLI invocation; building needs no production secrets.
let instance: ReturnType<typeof createAuth> | undefined;
export function getAuth() { return instance ??= createAuth(); }
