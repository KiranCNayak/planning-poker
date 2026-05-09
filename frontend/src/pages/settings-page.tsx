import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function SettingsPage() {
	return (
		<Card>
			<CardHeader>
				<CardTitle>Settings</CardTitle>
			</CardHeader>
			<CardContent>
				<p className="text-sm text-muted-foreground">
					Settings v1 is intentionally minimal. Theme and moderation
					controls are fast-follow items.
				</p>
			</CardContent>
		</Card>
	);
}
