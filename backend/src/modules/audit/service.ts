import type { Prisma } from "@prisma/client";

export const writeAuditEvent = (
	tx: Prisma.TransactionClient,
	data: {
		roomId?: string;
		userId?: string;
		eventType: Prisma.AuditLogCreateInput["eventType"];
		payload: Prisma.InputJsonValue;
	},
) => {
	return tx.auditLog.create({
		data: {
			roomId: data.roomId,
			userId: data.userId,
			eventType: data.eventType,
			payload: data.payload,
		},
	});
};
