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
	JWT_ACCESS_EXPIRES_IN: z.string().default("2d"),
	JWT_REFRESH_EXPIRES_IN: z.string().default("30d"),
	ROOM_CAPACITY_LIMIT: z.coerce.number().default(100),
	FINGERPRINT_SALT: z.string().min(8).default("change-me-salt"),
	CORS_ORIGIN: z.string().default("http://localhost:5173"),
});

export const env = schema.parse(process.env);

export const corsOrigins = env.CORS_ORIGIN.split(",")
	.map((origin) => origin.trim())
	.filter(Boolean);
