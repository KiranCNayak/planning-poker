import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { useAuth } from "@/features/auth/use-auth";
import { APP_VERSION } from "@/lib/config";
import { Link } from "react-router-dom";

export function AppShell({ children }: { children: React.ReactNode }) {
	const { user, logout } = useAuth();

	return (
		<div className="page-shell">
			<header className="border-b bg-card/95 backdrop-blur">
				<div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3">
					<Link
						to="/"
						className="text-lg font-semibold tracking-tight">
						Planning Poker
					</Link>
					<div className="flex items-center gap-3">
						<ThemeToggle />
						{user ? (
							<>
								<Badge variant="secondary">Authenticated</Badge>
								<Link to="/profile">
									<Button
										variant="outline"
										size="sm">
										Profile
									</Button>
								</Link>
								<Link to="/settings">
									<Button
										variant="outline"
										size="sm">
										Settings
									</Button>
								</Link>
								<Button
									size="sm"
									onClick={logout}>
									Logout
								</Button>
							</>
						) : (
							<>
								<Badge variant="outline">Anonymous</Badge>
								<Link to="/login">
									<Button
										variant="outline"
										size="sm">
										Login
									</Button>
								</Link>
								<Link to="/register">
									<Button size="sm">Register</Button>
								</Link>
							</>
						)}
					</div>
				</div>
			</header>
			<main className="mx-auto w-full max-w-6xl px-4 py-8">
				{children}
			</main>
			<footer className="mx-auto w-full max-w-6xl px-4 pb-4 text-right text-xs text-muted-foreground">
				{APP_VERSION}
			</footer>
		</div>
	);
}
