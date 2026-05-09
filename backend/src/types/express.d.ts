import type { JwtPayload } from "../modules/auth/tokens.js";

declare global {
	namespace Express {
		interface Request {
			auth?: JwtPayload;
			identityKey?: string;
			anonId?: string;
		}
	}
}

export {};
