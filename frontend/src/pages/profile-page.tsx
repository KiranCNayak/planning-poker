import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/features/auth/use-auth";

export function ProfilePage() {
	const { user, anonId } = useAuth();

	return (
		<Card>
			<CardHeader>
				<CardTitle>Profile</CardTitle>
			</CardHeader>
			<CardContent className="space-y-2 text-sm">
				<p>
					<span className="font-medium">Type:</span>{" "}
					{user ? "Authenticated" : "Anonymous"}
				</p>
				{user ? (
					<>
						<p>
							<span className="font-medium">Email:</span>{" "}
							{user.email}
						</p>
						<p>
							<span className="font-medium">Username:</span>{" "}
							{user.username ?? "Not set"}
						</p>
					</>
				) : (
					<p>
						<span className="font-medium">Anon ID:</span>{" "}
						{anonId ?? "Unknown"}
					</p>
				)}
			</CardContent>
		</Card>
	);
}
