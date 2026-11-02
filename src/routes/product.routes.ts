import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma.js';
import { protect } from '../middleware/auth.middleware.js';
import { authorizeRoles } from '../middleware/role.middleware.js';
import { isPublicStorageImageUrl } from '../utils/storage.js';

const router = Router();

function parseProductList(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > 20) return null;
  if (value.some((item) => typeof item !== 'string' || item.trim().length > 120)) return null;
  return value.map((item: string) => item.trim()).filter(Boolean);
}

function parseCalories(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const calories = Number(value);
  return Number.isInteger(calories) && calories >= 0 && calories <= 100000
    ? calories
    : undefined;
}

// GET products with filtering and search
router.get('/', async (req: Request, res: Response) => {
  try {
    const { category, featured, search } = req.query;

    const where: any = { isActive: true };

    if (category) {
      where.category = {
        slug: String(category),
      };
    }

    if (featured === 'true') {
      where.isFeatured = true;
    }

    if (search) {
      where.OR = [
        { name: { contains: String(search), mode: 'insensitive' } },
        { description: { contains: String(search), mode: 'insensitive' } },
      ];
    }

    const products = await prisma.product.findMany({
      where,
      include: {
        category: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ success: true, data: products });
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch products' });
  }
});

// GET single product by id or slug
router.get('/:identifier', async (req: Request, res: Response) => {
  try {
    const identifier = String(req.params.identifier);
    const product = await prisma.product.findFirst({
      where: {
        OR: [{ id: identifier }, { slug: identifier }],
      },
      include: {
        category: true,
      },
    });

    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    res.json({ success: true, data: product });
  } catch (error) {
    console.error('Error fetching product:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch product' });
  }
});

// POST create product (Admin)
router.post('/', protect, authorizeRoles('SUPER_ADMIN', 'MANAGER'), async (req: Request, res: Response) => {
  try {
    const {
      name, slug, description, price, discountPrice, packSize, stock, imageUrl,
      isFeatured, categoryId, ingredients = [], highlights = [], calories: caloriesValue,
    } = req.body;
    const parsedIngredients = parseProductList(ingredients);
    const parsedHighlights = parseProductList(highlights);
    const calories = parseCalories(caloriesValue);

    if (!parsedIngredients || !parsedHighlights || calories === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Ingredients, highlights, or calorie value is invalid',
      });
    }

    if (!name || !slug || !price || !categoryId || !isPublicStorageImageUrl(imageUrl, 'products')) {
      return res.status(400).json({
        success: false,
        message: 'Name, slug, price, categoryId, and a product image uploaded to Supabase Storage are required',
      });
    }

    const category = await prisma.category.findUnique({
      where: { id: String(categoryId) },
      select: { id: true },
    });
    if (!category) {
      return res.status(400).json({
        success: false,
        message: 'Selected category does not exist. Create or reload a saved category before adding this product.',
      });
    }

    const product = await prisma.product.create({
      data: {
        name,
        slug,
        description,
        price: parseFloat(price),
        discountPrice: discountPrice ? parseFloat(discountPrice) : null,
        packSize,
        stock: stock !== undefined ? parseInt(stock) : 50,
        imageUrl,
        ingredients: parsedIngredients,
        highlights: parsedHighlights,
        calories,
        isFeatured: Boolean(isFeatured),
        categoryId,
      },
      include: { category: true },
    });

    res.status(201).json({ success: true, data: product });
  } catch (error: any) {
    console.error('Error creating product:', error);
    if (error.code === 'P2002') {
      return res.status(400).json({ success: false, message: 'Product slug already exists' });
    }
    if (error.code === 'P2003') {
      return res.status(400).json({
        success: false,
        message: 'Selected category is no longer available. Reload categories and try again.',
      });
    }
    res.status(500).json({ success: false, message: 'Failed to create product' });
  }
});

// PUT update product (Admin)
router.put('/:id', protect, authorizeRoles('SUPER_ADMIN', 'MANAGER'), async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const {
      name, slug, description, price, discountPrice, packSize, stock, imageUrl,
      isFeatured, isActive, categoryId, ingredients: ingredientsValue,
      highlights: highlightsValue, calories: caloriesValue,
    } = req.body;
    const ingredients = ingredientsValue === undefined ? undefined : parseProductList(ingredientsValue);
    const highlights = highlightsValue === undefined ? undefined : parseProductList(highlightsValue);
    const calories = parseCalories(caloriesValue);

    if (ingredients === null || highlights === null || calories === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Ingredients, highlights, or calorie value is invalid',
      });
    }

    if (imageUrl !== undefined && !isPublicStorageImageUrl(imageUrl, 'products')) {
      return res.status(400).json({
        success: false,
        message: 'Product images must be uploaded to Supabase Storage',
      });
    }

    const updated = await prisma.product.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(slug && { slug }),
        ...(description !== undefined && { description }),
        ...(price !== undefined && { price: parseFloat(price) }),
        ...(discountPrice !== undefined && { discountPrice: discountPrice ? parseFloat(discountPrice) : null }),
        ...(packSize !== undefined && { packSize }),
        ...(stock !== undefined && { stock: parseInt(stock) }),
        ...(imageUrl !== undefined && { imageUrl }),
        ...(ingredients !== undefined && { ingredients }),
        ...(highlights !== undefined && { highlights }),
        ...(calories !== undefined && { calories }),
        ...(isFeatured !== undefined && { isFeatured: Boolean(isFeatured) }),
        ...(isActive !== undefined && { isActive: Boolean(isActive) }),
        ...(categoryId && { categoryId }),
      },
      include: { category: true },
    });

    res.json({ success: true, data: updated });
  } catch (error) {
    console.error('Error updating product:', error);
    res.status(500).json({ success: false, message: 'Failed to update product' });
  }
});

// DELETE product (Admin)
router.delete('/:id', protect, authorizeRoles('SUPER_ADMIN', 'MANAGER'), async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    await prisma.product.delete({ where: { id } });
    res.json({ success: true, message: 'Product deleted successfully' });
  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(500).json({ success: false, message: 'Failed to delete product' });
  }
});

export default router;
