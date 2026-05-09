import type { Config } from "tailwindcss";

export default {
	darkMode: ["class"],
	content: ["./index.html", "./src/**/*.{ts,tsx}"],
	theme: {
		extend: {
			colors: {
				"background": "hsl(var(--background))",
				"foreground": "hsl(var(--foreground))",
				"card": "hsl(var(--card))",
				"card-foreground": "hsl(var(--card-foreground))",
				"primary": "hsl(var(--primary))",
				"primary-foreground": "hsl(var(--primary-foreground))",
				"muted": "hsl(var(--muted))",
				"muted-foreground": "hsl(var(--muted-foreground))",
				"border": "hsl(var(--border))",
				"input": "hsl(var(--input))",
				"ring": "hsl(var(--ring))",
				"destructive": "hsl(var(--destructive))",
				"destructive-foreground": "hsl(var(--destructive-foreground))",
			},
			borderRadius: {
				lg: "var(--radius)",
				md: "calc(var(--radius) - 2px)",
				sm: "calc(var(--radius) - 4px)",
			},
		},
	},
	plugins: [],
} satisfies Config;
