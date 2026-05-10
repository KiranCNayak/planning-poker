import { describe, expect, it } from "vitest";
import { resolveClientIp } from "../src/lib/identity.js";

describe("resolveClientIp", () => {
	it("returns the socket address verbatim when no proxy is trusted", () => {
		expect(resolveClientIp("203.0.113.5", "198.51.100.1", 0)).toBe(
			"203.0.113.5",
		);
	});

	it("returns the socket address when XFF is missing", () => {
		expect(resolveClientIp("203.0.113.5", undefined, 1)).toBe(
			"203.0.113.5",
		);
	});

	it("returns the socket address when XFF is empty", () => {
		expect(resolveClientIp("203.0.113.5", "", 1)).toBe("203.0.113.5");
	});

	it("returns the client IP when one gateway is trusted", () => {
		// Single nginx in front: gateway sets XFF to just the client IP, and
		// connects to the backend so handshake.address is the gateway's IP.
		expect(resolveClientIp("10.0.0.1", "198.51.100.42", 1)).toBe(
			"198.51.100.42",
		);
	});

	it("walks back N hops through a multi-proxy chain", () => {
		// chain = ["198.51.100.42", "10.0.0.7", "10.0.0.1"]
		// trust=2 -> skip 2 trusted from right -> client at index 0
		expect(resolveClientIp("10.0.0.1", "198.51.100.42, 10.0.0.7", 2)).toBe(
			"198.51.100.42",
		);
	});

	it("clamps trustProxy to chain length so it never overruns", () => {
		// Only one entry in the chain (just socket address); even with trust=5
		// we should not return undefined.
		expect(resolveClientIp("203.0.113.5", undefined, 5)).toBe(
			"203.0.113.5",
		);
	});

	it("handles XFF passed as an array (Node may collapse duplicate headers)", () => {
		expect(
			resolveClientIp("10.0.0.1", ["198.51.100.42", "10.0.0.7"], 2),
		).toBe("198.51.100.42");
	});

	it("ignores extra whitespace in the XFF header", () => {
		expect(
			resolveClientIp("10.0.0.1", "  198.51.100.42 ,  10.0.0.7 ", 2),
		).toBe("198.51.100.42");
	});

	it("with trust=1 and a longer chain, returns the rightmost untrusted entry", () => {
		// chain = ["198.51.100.42", "10.0.0.7", "10.0.0.1"]
		// trust=1 -> skip only the immediate gateway -> 10.0.0.7
		// (Models the case where the operator only trusts one hop but the
		//  upstream chain reports more — we must NOT return the spoofable left.)
		expect(resolveClientIp("10.0.0.1", "198.51.100.42, 10.0.0.7", 1)).toBe(
			"10.0.0.7",
		);
	});
});
