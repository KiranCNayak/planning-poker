import "dotenv/config";
import { z } from "zod";

const schema = z.object({
	NODE_ENV: z
		.enum(["development", "test", "production"])
		.default("development"),
	PORT: z.coerce.number().default(4000),
	DATABASE_URL: z
		.string()
		.min(1)
		.default(
			"postgresql://postgres:postgres@localhost:5432/postgres?schema=public",
		),
	REDIS_URL: z.string().min(1).default("redis://localhost:6379"),
	JWT_ACCESS_SECRET: z.string().min(16).default("change-me-access-secret"),
	JWT_REFRESH_SECRET: z.string().min(16).default("change-me-refresh-secret"),
	JWT_ANON_SECRET: z.string().min(16).default("change-me-anon-secret"),
	JWT_ACCESS_EXPIRES_IN: z.string().default("2d"),
	JWT_REFRESH_EXPIRES_IN: z.string().default("30d"),
	ROOM_CAPACITY_LIMIT: z.coerce.number().default(100),
	FINGERPRINT_SALT: z.string().min(8).default("change-me-salt"),
	CORS_ORIGIN: z.string().default("http://localhost:5173"),
	// Number of trusted upstream proxies between the client and this server.
	// 0 = direct (no gateway). Set to 1 behind a single nginx/API gateway that
	// forwards X-Forwarded-For. Mirrors Express's `trust proxy` semantics.
	TRUST_PROXY: z.coerce.number().int().min(0).default(0),
	// Shared invite code gating self-registration. When non-empty, every
	// /api/auth/register request must supply a matching `inviteCode`.
	// Empty (the default) disables the check, which is the dev experience.
	INVITE_CODE: z.string().default(""),
});

export const env = schema.parse(process.env);

export const corsOrigins = env.CORS_ORIGIN.split(",")
	.map((origin) => origin.trim())
	.filter(Boolean);
