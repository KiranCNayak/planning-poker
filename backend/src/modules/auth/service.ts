import bcrypt from "bcryptjs";
import { prisma } from "../../lib/prisma.js";

export const registerUser = async (
	email: string,
	password: string,
	anonId?: string,
) => {
	const passwordHash = await bcrypt.hash(password, 10);
	return prisma.user.create({
		data: {
			email,
			passwordHash,
			isAnonymous: false,
			anonId: anonId ?? null,
			roomCreateLimit: 30,
		},
	});
};

export const loginUser = async (email: string, password: string) => {
	const user = await prisma.user.findUnique({ where: { email } });
	if (!user?.passwordHash) return null;
	const ok = await bcrypt.compare(password, user.passwordHash);
	if (!ok) return null;
	return user;
};
