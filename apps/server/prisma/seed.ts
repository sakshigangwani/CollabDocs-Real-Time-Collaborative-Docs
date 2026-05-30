import { PrismaClient } from "@prisma/client";


const prisma = new PrismaClient();

async function main() {
  await prisma.documentAcl.deleteMany();
  await prisma.document.deleteMany();
  await prisma.workspaceMember.deleteMany();
  await prisma.workspace.deleteMany();
  await prisma.user.deleteMany();

  const demo = await prisma.user.create({
    data: {
      email: "demo@collabdocs.app",
      name: "Demo User",
    },
  });

  const workspace = await prisma.workspace.create({
    data: {
      name: "Demo Workspace",
      slug: "demo",
      ownerId: demo.id,
      members: {
        create: { userId: demo.id, role: "ADMIN" },
      },
    },
  });

  await prisma.document.create({
    data: {
      title: "Welcome to CollabDocs",
      workspaceId: workspace.id,
      createdById: demo.id,
      acl: {
        create: {
          principalType: "USER",
          principalId: demo.id,
          role: "OWNER",
        },
      },
    },
  });

  console.log("Seeded: 1 user, 1 workspace, 1 document.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
