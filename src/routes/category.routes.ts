import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma.js';
import { protect } from '../middleware/auth.middleware.js';
import { authorizeRoles } from '../middleware/role.middleware.js';
import { isPublicStorageImageUrl } from '../utils/storage.js';

const router = Router();

// GET all categories
router.get('/', async (req: Request, res: Response) => {
  try {
    const categories = await prisma.category.findMany({
      include: {
        _count: {
          select: { products: true },
        },
      },
      orderBy: { name: 'asc' },
    });
    res.json({ success: true, data: categories });
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch categories' });
  }
});

// GET single category by slug or id
router.get('/:identifier', async (req: Request, res: Response) => {
  try {
    const identifier = String(req.params.identifier);
    const category = await prisma.category.findFirst({
      where: {
        OR: [{ id: identifier }, { slug: identifier }],
      },
      include: {
        products: {
          where: { isActive: true },
        },
      },
    });

    if (!category) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }

    res.json({ success: true, data: category });
  } catch (error) {
    console.error('Error fetching category:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch category' });
  }
});

// POST create category (Admin)
router.post('/', protect, authorizeRoles('SUPER_ADMIN', 'MANAGER'), async (req: Request, res: Response) => {
  try {
    const { name, slug, description, imageUrl } = req.body;
    if (!name || !slug || !isPublicStorageImageUrl(imageUrl, 'categories')) {
      return res.status(400).json({
        success: false,
        message: 'Name, slug, and a category image uploaded to Supabase Storage are required',
      });
    }

    const category = await prisma.category.create({
      data: { name, slug, description, imageUrl },
    });
    res.status(201).json({ success: true, data: category });
  } catch (error: any) {
    console.error('Error creating category:', error);
    if (error.code === 'P2002') {
      return res.status(400).json({ success: false, message: 'Category with this name or slug already exists' });
    }
    res.status(500).json({ success: false, message: 'Failed to create category' });
  }
});

export default router;
