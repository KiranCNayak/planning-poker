import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import { env } from "./config/env.js";
import { optionalAuth } from "./middleware/auth.js";
import { authRouter } from "./modules/auth/routes.js";
import { roomsRouter } from "./modules/rooms/routes.js";
import { usersRouter } from "./modules/users/routes.js";
import { bansRouter } from "./modules/bans/routes.js";

export const createApp = () => {
	const app = express();
	app.use(helmet());
	app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
	app.use(express.json());
	app.use(cookieParser());
	app.use(optionalAuth);

	app.get("/health", (_req, res) => res.json({ ok: true }));

	app.use("/api/auth", authRouter);
	app.use("/api/rooms", roomsRouter);
	app.use("/api/rooms/:shortCode/bans", bansRouter);
	app.use("/api/users", usersRouter);

	return app;
};
