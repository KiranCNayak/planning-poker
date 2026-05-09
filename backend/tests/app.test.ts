import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import {
	signAccessToken,
	verifyAccessToken,
} from "../src/modules/auth/tokens.js";

describe("bootstrap", () => {
	it("creates express app", () => {
		const app = createApp();
		expect(app).toBeDefined();
	});

	it("signs and verifies access token", () => {
		const token = signAccessToken("user-1");
		const payload = verifyAccessToken(token);
		expect(payload.sub).toBe("user-1");
		expect(payload.kind).toBe("access");
	});
});
