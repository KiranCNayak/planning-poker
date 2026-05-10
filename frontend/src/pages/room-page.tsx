import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { io, type Socket } from "socket.io-client";
import { QRCodeSVG } from "qrcode.react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/features/auth/use-auth";
import { apiFetch } from "@/lib/http";
import { SHARE_BASE_URL, SOCKET_BASE_URL } from "@/lib/config";
import { computeStats } from "@/features/room/stats";
import { DECK } from "@/lib/deck";
import type { Participant } from "@/features/room/types";

export function RoomPage() {
	const { shortCode = "" } = useParams();
	const { user, anonId, fingerprint, isLoading, fpResolved, accessToken } =
		useAuth();
	const navigate = useNavigate();
	const socketRef = useRef<Socket | null>(null);
	const [members, setMembers] = useState<Participant[]>([]);
	const [votesRevealed, setVotesRevealed] = useState(false);
	const [votes, setVotes] = useState<Record<string, string>>({});
	const [selected, setSelected] = useState<string | null>(null);
	const [myIdentityKey, setMyIdentityKey] = useState<string>("");
	const [status, setStatus] = useState<
		"connecting" | "connected" | "reconnecting" | "disconnected"
	>("connecting");
	const [capacity] = useState(100);
	const [copied, setCopied] = useState(false);
	const [shareUrl, setShareUrl] = useState("");
	const [qrOpen, setQrOpen] = useState(false);
	const [roomName, setRoomName] = useState<string | null>(null);
	const [roomColor, setRoomColor] = useState<string | null>(null);

	useEffect(() => {
		setShareUrl(`${SHARE_BASE_URL}/room/${shortCode}`);
	}, [shortCode]);

	useEffect(() => {
		let cancelled = false;
		apiFetch<{ name: string | null; color: string | null }>(
			`/api/rooms/${shortCode}`,
		)
			.then((data) => {
				if (cancelled) return;
				setRoomName(data.name);
				setRoomColor(data.color);
			})
			.catch(() => {});
		return () => {
			cancelled = true;
		};
	}, [shortCode]);

	useEffect(() => {
		// Wait until fingerprint and anon identity have stabilised to avoid
		// opening a connection with an "unknown" fingerprint, which would produce
		// a different identity key than the one used on subsequent renders.
		if (isLoading || !fpResolved) {
			setStatus("connecting");
			return;
		}

		const displayName =
			user?.username ??
			user?.email ??
			`user_${(anonId ?? "anon").slice(0, 6)}`;

		const socket = io(`${SOCKET_BASE_URL}/room`, {
			transports: ["websocket"],
			// Server builds the identity key from these + IP; never trust client-sent identityKey
			auth: {
				token: accessToken ?? undefined,
				fingerprint,
			},
		});
		socketRef.current = socket;

		socket.on("connect", () => {
			setStatus("connected");
			socket.emit("room:join", { shortCode, displayName });
		});

		socket.on("disconnect", () => setStatus("disconnected"));
		socket.on("reconnect_attempt", () => setStatus("reconnecting"));

		socket.on(
			"room:state_sync",
			({
				identityKey,
				is_reconnect,
				restored_vote,
				members: snapshot,
			}: {
				identityKey: string;
				is_reconnect: boolean;
				restored_vote: string | null;
				members: Array<{
					identity_key: string;
					display_name: string;
					is_authenticated: boolean;
					voted: boolean;
				}>;
			}) => {
				setMyIdentityKey(identityKey);
				if (is_reconnect) setStatus("connected");
				if (restored_vote) setSelected(restored_vote);
				if (snapshot) {
					setMembers(
						snapshot.map((m) => ({
							identityKey: m.identity_key,
							displayName: m.display_name,
							isAuthenticated: m.is_authenticated,
							voted: m.voted,
						})),
					);
				}
			},
		);

		socket.on(
			"user:joined",
			({
				user_id,
				display_name,
				is_authenticated,
			}: {
				user_id: string;
				display_name: string;
				is_authenticated: boolean;
			}) => {
				setMembers((prev) => {
					if (prev.some((m) => m.identityKey === user_id))
						return prev;
					return [
						...prev,
						{
							identityKey: user_id,
							displayName: display_name,
							isAuthenticated: is_authenticated,
							voted: false,
						},
					];
				});
			},
		);

		socket.on("user:left", ({ user_id }: { user_id: string }) => {
			setMembers((prev) => prev.filter((m) => m.identityKey !== user_id));
		});

		socket.on(
			"user:reconnected",
			({
				user_id,
				display_name,
			}: {
				user_id: string;
				display_name: string;
			}) => {
				setMembers((prev) => {
					if (prev.some((m) => m.identityKey === user_id))
						return prev;
					return [
						...prev,
						{
							identityKey: user_id,
							displayName: display_name,
							isAuthenticated: false,
							voted: false,
						},
					];
				});
			},
		);

		socket.on("user:disconnected", () => {
			// Peer is in 60s grace window; keep them in the list until user:left fires
		});

		socket.on("user:voted", ({ user_id }: { user_id: string }) => {
			setMembers((prev) =>
				prev.map((m) =>
					m.identityKey === user_id ? { ...m, voted: true } : m,
				),
			);
		});

		socket.on(
			"room:votes_revealed",
			({ votes: incoming }: { votes: Record<string, string> }) => {
				setVotes(incoming);
				setVotesRevealed(true);
				setMembers((prev) =>
					prev.map((m) => ({ ...m, vote: incoming[m.identityKey] })),
				);
			},
		);

		socket.on("room:votes_hidden", () => setVotesRevealed(false));
		socket.on("room:reset", () => {
			setVotes({});
			setSelected(null);
			setVotesRevealed(false);
			setMembers((prev) =>
				prev.map((m) => ({ ...m, voted: false, vote: undefined })),
			);
		});

		socket.on("room:capacity_exceeded", () => navigate("/room-capacity"));
		socket.on("room:banned", () => navigate("/room-banned"));
		socket.on("room:expired", () => navigate("/room-expired"));

		return () => {
			socket.disconnect();
		};
	}, [
		shortCode,
		isLoading,
		fpResolved,
		fingerprint,
		anonId,
		accessToken,
		navigate,
	]);

	const onVote = (value: string) => {
		setSelected(value);
		socketRef.current?.emit("room:vote", { value });
	};

	const stats = computeStats(votes);

	const copyShareUrl = async () => {
		if (!shareUrl) return;
		await navigator.clipboard.writeText(shareUrl);
		setCopied(true);
		setTimeout(() => setCopied(false), 1500);
	};

	return (
		<div className="space-y-6">
			<Card
				className="overflow-hidden"
				style={
					roomColor
						? { borderTop: `4px solid ${roomColor}` }
						: undefined
				}>
				<CardHeader>
					<div className="flex flex-wrap items-center justify-between gap-3">
						<div className="flex items-center gap-3">
							{roomColor ? (
								<span
									aria-hidden
									className="h-6 w-6 shrink-0 rounded-full border"
									style={{ backgroundColor: roomColor }}
								/>
							) : null}
							<div className="flex flex-col">
								<CardTitle>
									{roomName ?? "Untitled Room"}
								</CardTitle>
								<span className="font-mono text-xs text-muted-foreground">
									{shortCode}
								</span>
							</div>
						</div>
						<div className="flex items-center gap-2">
							<Badge variant="outline">
								{members.length} / {capacity}
							</Badge>
							<Badge
								variant={
									status === "connected"
										? "default"
										: "secondary"
								}>
								{status}
							</Badge>
						</div>
					</div>
				</CardHeader>
			</Card>

			<div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
				<div className="space-y-6">
					<Card>
						<CardHeader>
							<CardTitle>Pick a Card</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="grid grid-cols-4 gap-2 md:grid-cols-6 lg:grid-cols-8">
								{DECK.map((v) => (
									<Button
										key={v}
										variant={
											selected === v
												? "default"
												: "outline"
										}
										onClick={() => onVote(v)}>
										{v}
									</Button>
								))}
							</div>
						</CardContent>
					</Card>

					<div className="flex flex-wrap gap-2">
						<Button
							onClick={() =>
								socketRef.current?.emit("room:reveal")
							}>
							Reveal
						</Button>
						<Button
							variant="outline"
							onClick={() =>
								socketRef.current?.emit("room:hide")
							}>
							Hide
						</Button>
						<Button
							variant="outline"
							onClick={() =>
								socketRef.current?.emit("room:reset")
							}>
							Reset
						</Button>
					</div>

					<Card>
						<CardHeader>
							<CardTitle>Participants</CardTitle>
						</CardHeader>
						<CardContent className="space-y-2">
							{members.length === 0 ? (
								<p className="text-sm text-muted-foreground">
									No participants yet.
								</p>
							) : null}
							{members.map((m) => (
								<div
									key={m.identityKey}
									className="flex items-center justify-between rounded-md border p-2 text-sm">
									<div className="flex items-center gap-2">
										<span>
											{m.displayName}
											{m.identityKey === myIdentityKey
												? " (you)"
												: ""}
										</span>
										<Badge variant="outline">
											{m.isAuthenticated
												? "Auth"
												: "Anon"}
										</Badge>
									</div>
									<span>
										{votesRevealed
											? (m.vote ?? "—")
											: m.voted
												? "Voted"
												: "Waiting"}
									</span>
								</div>
							))}
						</CardContent>
					</Card>

					{votesRevealed ? (
						<Card>
							<CardHeader>
								<CardTitle>Reveal Stats</CardTitle>
							</CardHeader>
							<CardContent className="grid gap-2 text-sm md:grid-cols-2">
								<p>
									<span className="font-medium">
										Average:
									</span>{" "}
									{stats.average ?? "N/A"}
								</p>
								<p>
									<span className="font-medium">Median:</span>{" "}
									{stats.median ?? "N/A"}
								</p>
								<p>
									<span className="font-medium">
										Consensus:
									</span>{" "}
									{stats.consensus ? "Yes" : "No"}
								</p>
								<p>
									<span className="font-medium">
										`?` Count:
									</span>{" "}
									{stats.unknownCount}
								</p>
								<p>
									<span className="font-medium">
										`☕` Count:
									</span>{" "}
									{stats.coffeeCount}
								</p>
							</CardContent>
						</Card>
					) : null}
				</div>

				<aside className="space-y-6 lg:sticky lg:top-6 lg:self-start">
					<Card>
						<CardHeader>
							<CardTitle>Share Room</CardTitle>
						</CardHeader>
						<CardContent className="flex flex-col items-center gap-4">
							<div className="rounded-lg border bg-white p-3">
								<button
									type="button"
									onClick={() => setQrOpen(true)}
									className="cursor-zoom-in"
									aria-label="Expand QR code">
									<QRCodeSVG
										value={shareUrl || shortCode}
										size={160}
									/>
								</button>
							</div>
							<div className="w-full space-y-2 text-sm">
								<p className="text-muted-foreground">
									Scan to open on mobile, or copy the link.
								</p>
								<p className="break-all rounded-md border bg-muted px-3 py-2 font-mono text-xs">
									{shareUrl}
								</p>
								<Button
									variant="outline"
									size="sm"
									className="w-full"
									onClick={copyShareUrl}>
									{copied ? "Copied" : "Copy Link"}
								</Button>
							</div>
						</CardContent>
					</Card>
				</aside>
			</div>

			{qrOpen ? (
				<div
					className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4"
					onClick={() => setQrOpen(false)}>
					<div
						className="rounded-xl border bg-white p-4 shadow-2xl"
						onClick={(e) => e.stopPropagation()}>
						<div className="mb-3 flex justify-end">
							<Button
								variant="outline"
								size="sm"
								onClick={() => setQrOpen(false)}>
								Close
							</Button>
						</div>
						<QRCodeSVG
							value={shareUrl || shortCode}
							size={320}
						/>
					</div>
				</div>
			) : null}
		</div>
	);
}
