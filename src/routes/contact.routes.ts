import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma.js';
import { protect } from '../middleware/auth.middleware.js';
import { authorizeRoles } from '../middleware/role.middleware.js';

const router = Router();

// POST Save customer inquiry message
router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, emailOrPhone, subject, message } = req.body;

    if (!name || !emailOrPhone || !message) {
      return res.status(400).json({
        success: false,
        message: 'Name, email/phone, and message are required',
      });
    }

    const saved = await prisma.contactMessage.create({
      data: {
        name,
        emailOrPhone,
        subject: subject || 'General Inquiry',
        message,
      },
    });

    res.status(201).json({
      success: true,
      message: 'ধন্যবাদ! আপনার বার্তাটি আমাদের কাছে পৌঁছেছে।',
      data: saved,
    });
  } catch (error) {
    console.error('Error saving contact message:', error);
    res.status(500).json({ success: false, message: 'Failed to send message' });
  }
});

// GET all messages (Admin)
router.get('/', protect, authorizeRoles('ADMIN'), async (_req: Request, res: Response) => {
  try {
    const messages = await prisma.contactMessage.findMany({
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, data: messages });
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch messages' });
  }
});

export default router;
