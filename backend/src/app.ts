import express, {
	type NextFunction,
	type Request,
	type Response,
} from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import { corsOrigins } from "./config/env.js";
import { optionalAuth } from "./middleware/auth.js";
import { authRouter } from "./modules/auth/routes.js";
import { roomsRouter } from "./modules/rooms/routes.js";
import { usersRouter } from "./modules/users/routes.js";
import { bansRouter } from "./modules/bans/routes.js";

export const createApp = () => {
	const app = express();
	app.use(helmet());
	app.use(cors({ origin: corsOrigins, credentials: true }));
	app.use(express.json());
	app.use(cookieParser());
	app.use(optionalAuth);

	app.get("/health", (_req, res) => res.json({ ok: true }));

	app.use("/api/auth", authRouter);
	app.use("/api/rooms", roomsRouter);
	app.use("/api/rooms/:shortCode/bans", bansRouter);
	app.use("/api/users", usersRouter);

	app.use(
		(err: unknown, _req: Request, res: Response, _next: NextFunction) => {
			console.error(err);
			res.status(500).json({ error: "INTERNAL_ERROR" });
		},
	);

	return app;
};
