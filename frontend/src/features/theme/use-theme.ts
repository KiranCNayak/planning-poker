import { useCallback, useEffect, useState } from "react";

export type Theme = "light" | "dark";

const STORAGE_KEY = "theme";

function readInitialTheme(): Theme {
	if (typeof document !== "undefined") {
		return document.documentElement.classList.contains("dark")
			? "dark"
			: "light";
	}
	return "light";
}

function applyTheme(theme: Theme) {
	const root = document.documentElement;
	if (theme === "dark") root.classList.add("dark");
	else root.classList.remove("dark");
}

export function useTheme() {
	const [theme, setThemeState] = useState<Theme>(readInitialTheme);

	useEffect(() => {
		const onStorage = (e: StorageEvent) => {
			if (
				e.key === STORAGE_KEY &&
				(e.newValue === "light" || e.newValue === "dark")
			) {
				applyTheme(e.newValue);
				setThemeState(e.newValue);
			}
		};
		window.addEventListener("storage", onStorage);
		return () => window.removeEventListener("storage", onStorage);
	}, []);

	const setTheme = useCallback((next: Theme) => {
		applyTheme(next);
		try {
			localStorage.setItem(STORAGE_KEY, next);
		} catch {}
		setThemeState(next);
	}, []);

	const toggle = useCallback(() => {
		setTheme(readInitialTheme() === "dark" ? "light" : "dark");
	}, [setTheme]);

	return { theme, setTheme, toggle };
}
