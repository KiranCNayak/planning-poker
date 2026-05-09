const browserOrigin = `${window.location.protocol}//${window.location.hostname}`;

export const API_BASE_URL =
	import.meta.env.VITE_API_BASE_URL ?? `${browserOrigin}:4000`;
export const SOCKET_BASE_URL = import.meta.env.VITE_SOCKET_BASE_URL ?? API_BASE_URL;
export const SHARE_BASE_URL = import.meta.env.VITE_SHARE_BASE_URL ?? window.location.origin;
