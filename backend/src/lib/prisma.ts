// `@prisma/client` ships as CommonJS, so under Node's ESM loader the named
// `import { PrismaClient }` form fails with "Named export 'PrismaClient' not
// found". Default-import the CJS module object and destructure manually.
import pkg from "@prisma/client";
const { PrismaClient } = pkg;

export const prisma = new PrismaClient();
