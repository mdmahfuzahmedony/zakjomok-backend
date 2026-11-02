import { Router } from 'express';



import { protect } from '../middleware/auth.middleware.js';
import { getMe, login, logout, register } from '../crontrolers/auth.controller.js';

const router = Router();

router.post('/register', register);
router.post('/login', login);

router.get('/me', protect, getMe);
router.post('/logout', protect, logout);

export default router;