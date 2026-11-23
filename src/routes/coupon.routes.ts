import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma.js';
import { protect } from '../middleware/auth.middleware.js';
import { authorizeRoles } from '../middleware/role.middleware.js';

const router = Router();

async function findApplicableCoupon(code: string, subtotal: number, userId?: string) {
  const coupon = await prisma.coupon.findUnique({
    where: { code: code.trim().toUpperCase() },
  });

  if (!coupon || !coupon.isActive || (coupon.validUntil && coupon.validUntil <= new Date())) {
    return { error: 'কুপন কোডটি সঠিক নয় অথবা মেয়াদ শেষ' };
  }

  if (subtotal < Number(coupon.minOrderAmount)) {
    return { error: `এই কুপনটি ব্যবহার করতে ন্যূনতম ৳${coupon.minOrderAmount} টাকার অর্ডার করতে হবে` };
  }

  if (coupon.userId && coupon.userId !== userId) {
    return { error: 'এই কুপনটি শুধুমাত্র নির্দিষ্ট গ্রাহকের জন্য প্রযোজ্য' };
  }

  const discount = coupon.discountPercent
    ? Math.round((subtotal * Number(coupon.discountPercent)) / 100)
    : Number(coupon.discountAmount || 0);

  return {
    coupon,
    discountAmount: Math.min(subtotal, discount),
  };
}

// POST Validate coupon
router.post('/validate', async (req: Request, res: Response) => {
  try {
    const { code, subtotal, userId } = req.body;

    const cartSubtotal = Number(subtotal);
    if (!code || !Number.isFinite(cartSubtotal) || cartSubtotal < 0) {
      return res.status(400).json({ success: false, message: 'সঠিক কুপন কোড ও অর্ডারের মূল্য দিন' });
    }

    const result = await findApplicableCoupon(String(code), cartSubtotal, userId);
    if ('error' in result) {
      return res.status(400).json({ success: false, message: result.error });
    }

    res.json({
      success: true,
      message: 'কুপন সফলভাবে প্রয়োগ করা হয়েছে!',
      data: {
        code: result.coupon.code,
        description: result.coupon.description,
        discountAmount: result.discountAmount,
      },
    });
  } catch (error) {
    console.error('Error validating coupon:', error);
    res.status(500).json({ success: false, message: 'Failed to validate coupon' });
  }
});

router.get('/active', async (_req: Request, res: Response) => {
  try {
    const coupons = await prisma.coupon.findMany({
      where: {
        isActive: true,
        userId: null,
        OR: [{ validUntil: null }, { validUntil: { gt: new Date() } }],
      },
      select: {
        id: true,
        code: true,
        description: true,
        discountPercent: true,
        discountAmount: true,
        minOrderAmount: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ success: true, data: coupons });
  } catch (error) {
    console.error('Error fetching active coupons:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch active coupons' });
  }
});

router.get('/', protect, authorizeRoles('ADMIN'), async (_req: Request, res: Response) => {
  try {
    const coupons = await prisma.coupon.findMany({ orderBy: { createdAt: 'desc' } });
    res.json({ success: true, data: coupons });
  } catch (error) {
    console.error('Error fetching coupons:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch coupons' });
  }
});

// POST Create Coupon (Admin)
router.post('/', protect, authorizeRoles('ADMIN'), async (req: Request, res: Response) => {
  try {
    const { code, description, discountPercent, discountAmount, minOrderAmount, userId } = req.body;

    const hasPercent = discountPercent !== undefined && discountPercent !== null && discountPercent !== '';
    const hasAmount = discountAmount !== undefined && discountAmount !== null && discountAmount !== '';
    if (!code || hasPercent === hasAmount) {
      return res.status(400).json({ success: false, message: 'কোড এবং শতাংশ অথবা নির্দিষ্ট ছাড়ের একটি মান দিন' });
    }

    const discountValue = Number(hasPercent ? discountPercent : discountAmount);
    const minimumOrder = minOrderAmount ? Number(minOrderAmount) : 0;
    if (
      !Number.isFinite(discountValue) ||
      discountValue <= 0 ||
      (hasPercent && discountValue > 100) ||
      !Number.isFinite(minimumOrder) ||
      minimumOrder < 0
    ) {
      return res.status(400).json({ success: false, message: 'কুপনের ছাড় ও সর্বনিম্ন অর্ডারের পরিমাণ সঠিক নয়' });
    }

    const coupon = await prisma.coupon.create({
      data: {
        code: String(code).trim().toUpperCase(),
        description,
        discountPercent: hasPercent ? discountValue : null,
        discountAmount: hasAmount ? discountValue : null,
        minOrderAmount: minimumOrder,
        userId: userId || null,
      },
    });

    res.status(201).json({ success: true, data: coupon });
  } catch (error) {
    console.error('Error creating coupon:', error);
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2002'
    ) {
      return res.status(400).json({ success: false, message: 'এই কুপন কোডটি আগে থেকেই আছে' });
    }
    res.status(500).json({ success: false, message: 'Failed to create coupon' });
  }
});

router.patch('/:id/status', protect, authorizeRoles('ADMIN'), async (req: Request, res: Response) => {
  try {
    const { isActive } = req.body;
    if (typeof isActive !== 'boolean') {
      return res.status(400).json({ success: false, message: 'সঠিক active status দিন' });
    }

    const coupon = await prisma.coupon.update({
      where: { id: String(req.params.id) },
      data: { isActive },
    });

    res.json({ success: true, data: coupon });
  } catch (error) {
    console.error('Error updating coupon status:', error);
    res.status(500).json({ success: false, message: 'Failed to update coupon status' });
  }
});

export default router;
