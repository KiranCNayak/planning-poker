import { API_BASE_URL } from "./config";

let accessToken: string | null = null;

export const tokenStore = {
	get: () => accessToken,
	set: (token: string | null) => {
		accessToken = token;
	},
};

async function refreshAccessToken() {
	const res = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
		method: "POST",
		credentials: "include",
	});
	if (!res.ok) {
		tokenStore.set(null);
		throw new Error("REFRESH_FAILED");
	}
	const data = (await res.json()) as { accessToken: string };
	tokenStore.set(data.accessToken);
	return data.accessToken;
}

export async function apiFetch<T>(
	path: string,
	init: RequestInit = {},
	retry = true,
): Promise<T> {
	const headers = new Headers(init.headers);
	if (tokenStore.get())
		headers.set("Authorization", `Bearer ${tokenStore.get()}`);
	if (!headers.has("Content-Type") && init.body)
		headers.set("Content-Type", "application/json");

	const res = await fetch(`${API_BASE_URL}${path}`, {
		...init,
		headers,
		credentials: "include",
	});

	if (res.status === 401 && retry) {
		await refreshAccessToken();
		return apiFetch<T>(path, init, false);
	}

	if (!res.ok) {
		const maybeJson = await res.json().catch(() => ({}));
		throw new Error(
			(maybeJson as { error?: string }).error ?? "REQUEST_FAILED",
		);
	}

	if (res.status === 204) return {} as T;
	return (await res.json()) as T;
}
