import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma.js';
import { protect } from '../middleware/auth.middleware.js';
import { authorizeRoles } from '../middleware/role.middleware.js';

const router = Router();

// POST Place New Order (Customer checkout)
router.post('/', async (req: Request, res: Response) => {
  try {
    const {
      customerName,
      customerPhone,
      customerAddress,
      deliveryCity = 'Dhaka',
      note,
      couponCode,
      userId,
      items, // array of { productId, quantity }
    } = req.body;

    if (!customerName || !customerPhone || !customerAddress || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Name, phone, delivery address, and at least one item are required',
      });
    }

    // Fetch products to verify pricing & stock
    const productIds = items.map((i: any) => i.productId);
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
    });

    const productMap = new Map(products.map((p) => [p.id, p]));

    let subtotal = 0;
    let totalQuantity = 0;
    const orderItemsData: any[] = [];

    for (const item of items) {
      const product = productMap.get(item.productId);
      if (!product) {
        return res.status(400).json({
          success: false,
          message: `Product with ID ${item.productId} not found`,
        });
      }

      const activePrice = Number(product.discountPrice ?? product.price);
      const quantity = Math.max(1, parseInt(item.quantity) || 1);
      const itemSubtotal = activePrice * quantity;

      subtotal += itemSubtotal;
      totalQuantity += quantity;
      orderItemsData.push({
        productId: product.id,
        productName: product.name,
        packSize: product.packSize,
        price: activePrice,
        quantity,
        subtotal: itemSubtotal,
      });
    }

    if (totalQuantity < 2) {
      return res.status(400).json({
        success: false,
        message: 'অর্ডার করতে কমপক্ষে ২টি পণ্য নিতে হবে',
      });
    }

    const deliveryCharge = 0;
    let appliedDiscount = 0;
    let appliedCouponCode: string | null = null;
    if (couponCode) {
      const coupon = await prisma.coupon.findUnique({
        where: { code: String(couponCode).trim().toUpperCase() },
      });

      if (!coupon || !coupon.isActive || (coupon.validUntil && coupon.validUntil <= new Date())) {
        return res.status(400).json({
          success: false,
          message: 'কুপন কোডটি সঠিক নয় অথবা মেয়াদ শেষ',
        });
      }

      if (subtotal < Number(coupon.minOrderAmount)) {
        return res.status(400).json({
          success: false,
          message: `এই কুপনটি ব্যবহার করতে ন্যূনতম ৳${coupon.minOrderAmount} টাকার অর্ডার করতে হবে`,
        });
      }

      if (coupon.userId && coupon.userId !== userId) {
        return res.status(403).json({
          success: false,
          message: 'এই কুপনটি শুধুমাত্র নির্দিষ্ট গ্রাহকের জন্য প্রযোজ্য',
        });
      }

      const couponDiscount = coupon.discountPercent
        ? Math.round((subtotal * Number(coupon.discountPercent)) / 100)
        : Number(coupon.discountAmount || 0);
      appliedDiscount = Math.min(subtotal, couponDiscount);
      appliedCouponCode = coupon.code;
    }
    const totalAmount = Math.max(0, subtotal + deliveryCharge - appliedDiscount);

    // Generate unique order number (e.g. ZAK-938210)
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const orderNumber = `ZAK-${Date.now().toString().slice(-4)}${randomSuffix}`;

    // Create Order with Items in a transaction
    const order = await prisma.order.create({
      data: {
        orderNumber,
        customerName,
        customerPhone,
        customerAddress,
        deliveryCity,
        note,
        subtotal,
        deliveryCharge,
        discountAmount: appliedDiscount,
        couponCode: appliedCouponCode,
        totalAmount,
        status: 'PENDING',
        paymentMethod: 'COD',
        userId: userId || null,
        items: {
          create: orderItemsData,
        },
      },
      include: {
        items: true,
      },
    });

    res.status(201).json({
      success: true,
      message: 'Order placed successfully! We will call you soon to confirm.',
      data: order,
    });
  } catch (error) {
    console.error('Error placing order:', error);
    res.status(500).json({ success: false, message: 'Failed to place order' });
  }
});

// GET all orders (Admin with filters)
router.get('/', protect, authorizeRoles('SUPER_ADMIN', 'MANAGER'), async (req: Request, res: Response) => {
  try {
    const { status, search } = req.query;

    const where: any = {};
    if (status && status !== 'ALL') {
      where.status = String(status);
    }

    if (search) {
      where.OR = [
        { orderNumber: { contains: String(search), mode: 'insensitive' } },
        { customerName: { contains: String(search), mode: 'insensitive' } },
        { customerPhone: { contains: String(search), mode: 'insensitive' } },
      ];
    }

    const orders = await prisma.order.findMany({
      where,
      include: {
        items: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ success: true, data: orders });
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch orders' });
  }
});

// GET single order by id or orderNumber
router.get('/:identifier', protect, authorizeRoles('SUPER_ADMIN', 'MANAGER'), async (req: Request, res: Response) => {
  try {
    const identifier = String(req.params.identifier);
    const order = await prisma.order.findFirst({
      where: {
        OR: [{ id: identifier }, { orderNumber: identifier }],
      },
      include: {
        items: true,
      },
    });

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    res.json({ success: true, data: order });
  } catch (error) {
    console.error('Error fetching order:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch order' });
  }
});

// PATCH update order status (Admin)
// Valid statuses: PENDING -> CONFIRMED -> PROCESSING -> SHIPPED -> DELIVERED, CANCELLED
router.patch('/:id/status', protect, authorizeRoles('SUPER_ADMIN', 'MANAGER'), async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const { status } = req.body;

    const validStatuses = ['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
      });
    }

    const updated = await prisma.order.update({
      where: { id },
      data: { status },
      include: { items: true },
    });

    res.json({
      success: true,
      message: `Order status changed to ${status}`,
      data: updated,
    });
  } catch (error) {
    console.error('Error updating order status:', error);
    res.status(500).json({ success: false, message: 'Failed to update order status' });
  }
});

export default router;
