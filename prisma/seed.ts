import { PrismaClient, RoleName } from "@prisma/client";
import bcrypt from "bcryptjs";
import { PERMISSIONS, ROLE_PERMISSIONS } from "../src/config/permissions";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding permissions...");
  for (const key of Object.values(PERMISSIONS)) {
    await prisma.permission.upsert({
      where: { key },
      update: {},
      create: { key },
    });
  }

  console.log("Seeding roles...");
  const roleNames = Object.keys(ROLE_PERMISSIONS) as RoleName[];
  for (const name of roleNames) {
    await prisma.role.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  console.log("Linking role -> permissions...");
  for (const roleName of roleNames) {
    const role = await prisma.role.findUniqueOrThrow({ where: { name: roleName } });
    const permissionKeys = ROLE_PERMISSIONS[roleName];

    for (const key of permissionKeys) {
      const permission = await prisma.permission.findUniqueOrThrow({ where: { key } });
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
        update: {},
        create: { roleId: role.id, permissionId: permission.id },
      });
    }
  }

  console.log("Seeding default plans...");
  const freePlan = await prisma.plan.upsert({
    where: { name: "Free" },
    update: {},
    create: { name: "Free", priceMonthly: 0, maxClients: 2, maxUsers: 3 },
  });
  await prisma.plan.upsert({
    where: { name: "Agency" },
    update: {},
    create: { name: "Agency", priceMonthly: 99, maxClients: 25, maxUsers: 20 },
  });

  console.log("Seeding default Super Admin account...");
  const superAdminEmail = process.env.SEED_SUPER_ADMIN_EMAIL ?? "admin@platform.local";
  const superAdminPassword = process.env.SEED_SUPER_ADMIN_PASSWORD ?? "ChangeMe123!";
  const superAdminRole = await prisma.role.findUniqueOrThrow({ where: { name: "SUPER_ADMIN" } });

  const existingAdmin = await prisma.user.findUnique({ where: { email: superAdminEmail } });
  if (!existingAdmin) {
    const hashed = await bcrypt.hash(superAdminPassword, 12);
    await prisma.user.create({
      data: {
        email: superAdminEmail,
        password: hashed,
        firstName: "Super",
        lastName: "Admin",
        isEmailVerified: true,
        roleId: superAdminRole.id,
      },
    });
    console.log(`Created Super Admin: ${superAdminEmail} / ${superAdminPassword} (CHANGE THIS PASSWORD)`);
  } else {
    console.log("Super Admin already exists, skipping.");
  }

  // Demo agency + demo plan link so a fresh clone has something to look at.
  const demoAgency = await prisma.agency.upsert({
    where: { id: "00000000-0000-0000-0000-000000000001" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000001",
      name: "Demo Agency",
    },
  });
  await prisma.subscription.upsert({
    where: { agencyId: demoAgency.id },
    update: {},
    create: { agencyId: demoAgency.id, planId: freePlan.id, status: "ACTIVE" },
  });

  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
