import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma.js';
import { protect } from '../middleware/auth.middleware.js';
import { authorizeRoles } from '../middleware/role.middleware.js';

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  try {
    const posts = await prisma.blogPost.findMany({
      where: { isPublished: true },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        slug: true,
        excerpt: true,
        createdAt: true,
      },
    });
    res.json({ success: true, data: posts });
  } catch (error) {
    console.error('Error fetching published blog posts:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch blog posts' });
  }
});

router.get('/admin', protect, authorizeRoles('SUPER_ADMIN', 'MANAGER'), async (_req: Request, res: Response) => {
  try {
    const posts = await prisma.blogPost.findMany({
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, data: posts });
  } catch (error) {
    console.error('Error fetching admin blog posts:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch blog posts' });
  }
});

router.get('/:slug', async (req: Request, res: Response) => {
  try {
    const post = await prisma.blogPost.findFirst({
      where: { slug: String(req.params.slug), isPublished: true },
    });
    if (!post) {
      return res.status(404).json({ success: false, message: 'Blog post not found' });
    }
    res.json({ success: true, data: post });
  } catch (error) {
    console.error('Error fetching blog post:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch blog post' });
  }
});

router.post('/', protect, authorizeRoles('SUPER_ADMIN', 'MANAGER'), async (req: Request, res: Response) => {
  try {
    const title = typeof req.body.title === 'string' ? req.body.title.trim() : '';
    const excerpt = typeof req.body.excerpt === 'string' ? req.body.excerpt.trim() : '';
    const content = typeof req.body.content === 'string' ? req.body.content.trim() : '';

    if (!title || !excerpt || !content) {
      return res.status(400).json({
        success: false,
        message: 'শিরোনাম, সংক্ষিপ্ত পরিচিতি ও লেখার বিষয় পূরণ করুন।',
      });
    }

    const slugBase = title
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'blog';
    const post = await prisma.blogPost.create({
      data: {
        title,
        slug: `${slugBase}-${Date.now().toString(36)}`,
        excerpt,
        content,
      },
    });

    res.status(201).json({ success: true, data: post });
  } catch (error) {
    console.error('Error creating blog post:', error);
    res.status(500).json({ success: false, message: 'Failed to create blog post' });
  }
});

export default router;
