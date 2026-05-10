import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/features/theme/use-theme";

export function ThemeToggle() {
	const { theme, toggle } = useTheme();
	const isDark = theme === "dark";
	return (
		<Button
			variant="outline"
			size="sm"
			onClick={toggle}
			aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
			title={isDark ? "Switch to light mode" : "Switch to dark mode"}
			className="px-2.5">
			{isDark ? (
				<Sun className="h-4 w-4" />
			) : (
				<Moon className="h-4 w-4" />
			)}
		</Button>
	);
}
