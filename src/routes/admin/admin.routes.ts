import { Router, Request, Response } from 'express';
import prisma from '../../lib/prisma';
import { protect } from '../../middleware/auth.middleware.js';
import { authorizeRoles } from '../../middleware/role.middleware.js';

const router = Router();

router.use(protect);
router.use(authorizeRoles('SUPER_ADMIN', 'MANAGER'));

// GET Admin Dashboard Summary Stats
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const [
      totalOrders,
      pendingOrders,
      confirmedOrders,
      shippedOrders,
      deliveredOrders,
      totalProducts,
      totalCategories,
      recentOrders,
      lowStockProducts,
    ] = await Promise.all([
      prisma.order.count(),
      prisma.order.count({ where: { status: 'PENDING' } }),
      prisma.order.count({ where: { status: 'CONFIRMED' } }),
      prisma.order.count({ where: { status: 'SHIPPED' } }),
      prisma.order.count({ where: { status: 'DELIVERED' } }),
      prisma.product.count({ where: { isActive: true } }),
      prisma.category.count(),
      prisma.order.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: { items: true },
      }),
      prisma.product.findMany({
        where: { stock: { lte: 10 }, isActive: true },
        take: 5,
        orderBy: { stock: 'asc' },
      }),
    ]);

    // Calculate total delivered revenue
    const revenueAgg = await prisma.order.aggregate({
      _sum: { totalAmount: true },
      where: {
        status: { in: ['CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED'] },
      },
    });

    res.json({
      success: true,
      data: {
        stats: {
          totalRevenue: revenueAgg._sum.totalAmount || 0,
          totalOrders,
          pendingOrders,
          confirmedOrders,
          shippedOrders,
          deliveredOrders,
          totalProducts,
          totalCategories,
        },
        recentOrders,
        lowStockProducts,
      },
    });
  } catch (error) {
    console.error('Error fetching admin stats:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch admin stats' });
  }
});

export default router;
