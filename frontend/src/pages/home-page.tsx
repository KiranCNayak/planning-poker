import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/features/auth/use-auth";
import { apiFetch } from "@/lib/http";

const COLOR_OPTIONS = [
	{ label: "Classic Blue", value: "212 74% 39%" },
	{ label: "Slate", value: "220 14% 36%" },
	{ label: "Emerald", value: "160 84% 29%" },
];

export function HomePage() {
	const { user } = useAuth();
	const navigate = useNavigate();
	const [joinCode, setJoinCode] = useState("");
	const [roomName, setRoomName] = useState("");
	const [theme, setTheme] = useState(COLOR_OPTIONS[0].value);
	const [error, setError] = useState<string | null>(null);

	const createRoom = async (e: FormEvent) => {
		e.preventDefault();
		setError(null);
		try {
			const payload = {
				name: roomName || undefined,
				themePrimary: theme,
			};
			const room = await apiFetch<{ shortCode: string }>("/api/rooms", {
				method: "POST",
				body: JSON.stringify(payload),
			});
			navigate(`/room/${room.shortCode}`);
		} catch (err) {
			setError((err as Error).message);
		}
	};

	const joinRoom = (e: FormEvent) => {
		e.preventDefault();
		if (!joinCode.trim()) return;
		navigate(`/room/${joinCode.trim()}`);
	};

	return (
		<div className="grid gap-6 lg:grid-cols-2">
			<Card>
				<CardHeader>
					<CardTitle>Join Existing Room</CardTitle>
				</CardHeader>
				<CardContent>
					<form
						onSubmit={joinRoom}
						className="space-y-4">
						<div className="space-y-2">
							<Label htmlFor="joinCode">Room ID</Label>
							<Input
								id="joinCode"
								value={joinCode}
								onChange={(e) => setJoinCode(e.target.value)}
								placeholder="Paste room ID"
							/>
						</div>
						<Button
							type="submit"
							className="w-full">
							Join Room
						</Button>
					</form>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Create New Room</CardTitle>
				</CardHeader>
				<CardContent>
					{user ? (
						<form
							onSubmit={createRoom}
							className="space-y-4">
							<div className="space-y-2">
								<Label htmlFor="roomName">
									Room Name (optional)
								</Label>
								<Input
									id="roomName"
									maxLength={40}
									value={roomName}
									onChange={(e) =>
										setRoomName(e.target.value)
									}
									placeholder="Sprint Planning - Team A"
								/>
							</div>
							<div className="space-y-2">
								<Label>Theme Color</Label>
								<div className="grid grid-cols-3 gap-2">
									{COLOR_OPTIONS.map((opt) => (
										<button
											type="button"
											key={opt.value}
											onClick={() => setTheme(opt.value)}
											className={`h-10 rounded-md border ${theme === opt.value ? "ring-2 ring-ring" : ""}`}
											style={{
												backgroundColor: `hsl(${opt.value})`,
											}}
											aria-label={opt.label}
										/>
									))}
								</div>
							</div>
							{error ? (
								<p className="text-sm text-destructive">
									{error}
								</p>
							) : null}
							<Button
								type="submit"
								className="w-full">
								Create Room
							</Button>
						</form>
					) : (
						<div className="space-y-3">
							<p className="text-sm text-muted-foreground">
								Room creation is available only for
								authenticated users.
							</p>
							<Button
								className="w-full"
								onClick={() => navigate("/login")}>
								Login to Create Room
							</Button>
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
