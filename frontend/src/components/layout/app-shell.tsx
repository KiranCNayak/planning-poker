import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/use-auth";

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
		</div>
	);
}
