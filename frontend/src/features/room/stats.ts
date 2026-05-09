const NUMERIC = new Set([
	"1",
	"2",
	"3",
	"5",
	"8",
	"13",
	"21",
	"34",
	"55",
	"89",
]);

export function computeStats(votes: Record<string, string>) {
	const numericValues = Object.values(votes)
		.filter((v) => NUMERIC.has(v))
		.map((v) => Number(v));

	const unknownCount = Object.values(votes).filter((v) => v === "?").length;
	const coffeeCount = Object.values(votes).filter((v) => v === "☕").length;
	const average = numericValues.length
		? Number(
				(
					numericValues.reduce((a, b) => a + b, 0) /
					numericValues.length
				).toFixed(2),
			)
		: null;

	const consensus =
		numericValues.length > 0 &&
		numericValues.every((v) => v === numericValues[0]);
	const sorted = [...numericValues].sort((a, b) => a - b);
	const median =
		sorted.length === 0
			? null
			: sorted.length % 2 === 1
				? sorted[Math.floor(sorted.length / 2)]
				: (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) /
					2;

	return { average, median, consensus, unknownCount, coffeeCount };
}
