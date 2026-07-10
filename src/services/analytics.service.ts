import { prisma } from "../config/database";

async function agencyClientIds(agencyId: string): Promise<string[]> {
  const clients = await prisma.client.findMany({ where: { agencyId }, select: { id: true } });
  return clients.map((c) => c.id);
}

export const analyticsService = {
  /** Powers the dashboard summary cards: totals by status + client count. */
  async dashboardCards(agencyId: string) {
    const clientIds = await agencyClientIds(agencyId);

    const [totalClients, pending, scheduled, published, rejected] = await Promise.all([
      prisma.client.count({ where: { agencyId } }),
      prisma.post.count({ where: { clientId: { in: clientIds }, status: "PENDING_APPROVAL" } }),
      prisma.post.count({ where: { clientId: { in: clientIds }, status: "SCHEDULED" } }),
      prisma.post.count({ where: { clientId: { in: clientIds }, status: "PUBLISHED" } }),
      prisma.post.count({ where: { clientId: { in: clientIds }, status: "REJECTED" } }),
    ]);

    return { totalClients, pendingApprovals: pending, scheduledPosts: scheduled, publishedPosts: published, rejectedPosts: rejected };
  },

  /** Approval rate + rejection rate across all decided posts. */
  async approvalRate(agencyId: string) {
    const clientIds = await agencyClientIds(agencyId);
    const [approved, rejected, needsChanges] = await Promise.all([
      prisma.post.count({ where: { clientId: { in: clientIds }, status: { in: ["APPROVED", "SCHEDULED", "PUBLISHED"] } } }),
      prisma.post.count({ where: { clientId: { in: clientIds }, status: "REJECTED" } }),
      prisma.post.count({ where: { clientId: { in: clientIds }, status: "NEEDS_CHANGES" } }),
    ]);
    const total = approved + rejected + needsChanges;
    return {
      approved,
      rejected,
      needsChanges,
      approvalRatePct: total ? Math.round((approved / total) * 100) : 0,
    };
  },

  /** Monthly post volume for the last N months, for the "Monthly Posts" chart. */
  async monthlyPostVolume(agencyId: string, months = 6) {
    const clientIds = await agencyClientIds(agencyId);
    const since = new Date();
    since.setMonth(since.getMonth() - months);

    const posts = await prisma.post.findMany({
      where: { clientId: { in: clientIds }, createdAt: { gte: since } },
      select: { createdAt: true },
    });

    const buckets: Record<string, number> = {};
    for (const p of posts) {
      const key = `${p.createdAt.getFullYear()}-${String(p.createdAt.getMonth() + 1).padStart(2, "0")}`;
      buckets[key] = (buckets[key] ?? 0) + 1;
    }
    return Object.entries(buckets)
      .sort(([a], [b]) => (a > b ? 1 : -1))
      .map(([month, count]) => ({ month, count }));
  },

  /** Top clients by post volume. */
  async topClients(agencyId: string, limit = 5) {
    const grouped = await prisma.post.groupBy({
      by: ["clientId"],
      where: { client: { agencyId } },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      take: limit,
    });

    const clients = await prisma.client.findMany({
      where: { id: { in: grouped.map((g) => g.clientId) } },
      select: { id: true, companyName: true, logoUrl: true },
    });
    const byId = new Map(clients.map((c) => [c.id, c]));

    return grouped.map((g) => ({
      client: byId.get(g.clientId),
      postCount: g._count.id ?? 0,
    }));
  },

  /** Team performance: posts created + approval actions taken per team member. */
  async teamPerformance(agencyId: string) {
    const members = await prisma.user.findMany({
      where: { agencyId },
      select: { id: true, firstName: true, lastName: true, _count: { select: { createdPosts: true, approvalSteps: true } } },
    });
    return members.map((m) => ({
      userId: m.id,
      name: `${m.firstName} ${m.lastName}`,
      postsCreated: m._count.createdPosts,
      approvalActionsTaken: m._count.approvalSteps,
    }));
  },

  /** Platform performance: post counts and approval rate broken down by platform. */
  async platformPerformance(agencyId: string) {
    const clientIds = await agencyClientIds(agencyId);
    const grouped = await prisma.post.groupBy({
      by: ["platform", "status"],
      where: { clientId: { in: clientIds } },
      _count: { id: true },
    });

    const byPlatform: Record<string, { total: number; published: number }> = {};
    for (const row of grouped) {
      byPlatform[row.platform] ??= { total: 0, published: 0 };
      const count = row._count.id ?? 0;
      byPlatform[row.platform].total += count;
      if (row.status === "PUBLISHED") byPlatform[row.platform].published += count;
    }
    return Object.entries(byPlatform).map(([platform, stats]) => ({ platform, ...stats }));
  },
};
