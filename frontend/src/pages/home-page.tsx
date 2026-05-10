import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/features/auth/use-auth";
import { apiFetch } from "@/lib/http";
import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";

export function HomePage() {
	const { user } = useAuth();
	const navigate = useNavigate();
	const [joinCode, setJoinCode] = useState("");
	const [roomName, setRoomName] = useState("");
	const [error, setError] = useState<string | null>(null);

	const createRoom = async (e: FormEvent) => {
		e.preventDefault();
		setError(null);
		try {
			const room = await apiFetch<{ shortCode: string }>("/api/rooms", {
				method: "POST",
				body: JSON.stringify({ name: roomName || undefined }),
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
