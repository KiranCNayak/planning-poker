import { FormEvent, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/use-auth";

export function RegisterPage() {
	const { register } = useAuth();
	const navigate = useNavigate();
	const location = useLocation();
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [inviteCode, setInviteCode] = useState("");
	const [error, setError] = useState<string | null>(null);

	const redirectTo =
		(location.state as { from?: string } | undefined)?.from ?? "/";

	const onSubmit = async (e: FormEvent) => {
		e.preventDefault();
		setError(null);
		try {
			await register(email, password, inviteCode, redirectTo);
			navigate(redirectTo, { replace: true });
		} catch (err) {
			setError((err as Error).message);
		}
	};

	return (
		<Card className="mx-auto max-w-md">
			<CardHeader>
				<CardTitle>Register</CardTitle>
			</CardHeader>
			<CardContent>
				<form
					className="space-y-4"
					onSubmit={onSubmit}>
					<div className="space-y-2">
						<Label>Email</Label>
						<Input
							value={email}
							onChange={(e) => setEmail(e.target.value)}
						/>
					</div>
					<div className="space-y-2">
						<Label>Password</Label>
						<Input
							type="password"
							value={password}
							onChange={(e) => setPassword(e.target.value)}
						/>
					</div>
					<div className="space-y-2">
						<Label>Invite code</Label>
						<Input
							value={inviteCode}
							onChange={(e) => setInviteCode(e.target.value)}
							placeholder="Required in production"
						/>
					</div>
					{error ? (
						<p className="text-sm text-destructive">{error}</p>
					) : null}
					<Button
						type="submit"
						className="w-full">
						Register
					</Button>
				</form>
			</CardContent>
		</Card>
	);
}
