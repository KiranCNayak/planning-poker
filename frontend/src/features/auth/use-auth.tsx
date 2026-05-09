import { createContext, useContext, useEffect, useMemo, useState } from "react";
import FingerprintJS from "@fingerprintjs/fingerprintjs";
import { apiFetch, tokenStore } from "@/lib/http";

type User = {
	id: string;
	email: string | null;
	username: string | null;
	isAnonymous: boolean;
};

type AuthContextValue = {
	user: User | null;
	anonId: string | null;
	isLoading: boolean;
	login: (
		email: string,
		password: string,
		redirectTo?: string,
	) => Promise<void>;
	register: (
		email: string,
		password: string,
		redirectTo?: string,
	) => Promise<void>;
	logout: () => Promise<void>;
	refreshUser: () => Promise<void>;
	fingerprint: string;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
	const [user, setUser] = useState<User | null>(null);
	const [anonId, setAnonId] = useState<string | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [fingerprint, setFingerprint] = useState("unknown");

	const refreshUser = async () => {
		try {
			const me = await apiFetch<User>("/api/users/me");
			setUser(me);
		} catch {
			setUser(null);
		}
	};

	useEffect(() => {
		const init = async () => {
			try {
				const fp = await FingerprintJS.load();
				const result = await fp.get();
				setFingerprint(result.visitorId);
			} catch {
				setFingerprint("unknown");
			}

			try {
				const bootstrap = await apiFetch<{ anonId?: string }>(
					"/api/auth/anon/bootstrap",
					{ method: "POST" },
				).catch(() => ({ anonId: undefined }));
				if (bootstrap.anonId) setAnonId(bootstrap.anonId);
			} catch {
				// no-op
			}

			try {
				const refreshed = await apiFetch<{ accessToken: string }>(
					"/api/auth/refresh",
					{ method: "POST" },
				);
				tokenStore.set(refreshed.accessToken);
				await refreshUser();
			} catch {
				setUser(null);
			} finally {
				setIsLoading(false);
			}
		};
		void init();
	}, []);

	const login = async (email: string, password: string) => {
		const data = await apiFetch<{ accessToken: string; user: User }>(
			"/api/auth/login",
			{
				method: "POST",
				body: JSON.stringify({ email, password }),
			},
		);
		tokenStore.set(data.accessToken);
		setUser(data.user);
	};

	const register = async (email: string, password: string) => {
		const data = await apiFetch<{ accessToken: string; user: User }>(
			"/api/auth/register",
			{
				method: "POST",
				body: JSON.stringify({
					email,
					password,
					anonId: anonId ?? undefined,
				}),
			},
		);
		tokenStore.set(data.accessToken);
		setUser(data.user);
	};

	const logout = async () => {
		await apiFetch("/api/auth/logout", { method: "POST" });
		tokenStore.set(null);
		setUser(null);
	};

	const value = useMemo(
		() => ({
			user,
			anonId,
			isLoading,
			login,
			register,
			logout,
			refreshUser,
			fingerprint,
		}),
		[user, anonId, isLoading, fingerprint],
	);

	return (
		<AuthContext.Provider value={value}>{children}</AuthContext.Provider>
	);
}

export const useAuth = () => {
	const ctx = useContext(AuthContext);
	if (!ctx) throw new Error("useAuth must be used within AuthProvider");
	return ctx;
};
