
import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../config/prisma.js';
import { generateToken } from '../utils/token.js';
import { AuthRequest } from '../middleware/auth.middleware.js';

// Normalize Bangladesh mobile number
const normalizePhone = (phone: string): string => {
  let value = phone.replace(/[\s-]/g, '');

  if (value.startsWith('+880')) {
    value = '0' + value.slice(4);
  } else if (value.startsWith('880')) {
    value = '0' + value.slice(3);
  }

  return value;
};

// REGISTER
export const register = async (req: Request, res: Response) => {
  try {
    const { name, phone, password, city, address } = req.body;

    if (!name || !phone || !password || !city || !address) {
      return res.status(400).json({
        success: false,
        message: 'Name, mobile number, location, address and password are required',
      });
    }

    if (String(city).trim() !== 'Jessore Sadar') {
      return res.status(400).json({
        success: false,
        message: 'Registration is currently available only in Jessore Sadar',
      });
    }

    if (!String(name).trim() || !String(address).trim()) {
      return res.status(400).json({
        success: false,
        message: 'Name and address cannot be empty',
      });
    }

    const normalizedPhone = normalizePhone(String(phone));

    if (!/^01[3-9]\d{8}$/.test(normalizedPhone)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid Bangladesh mobile number',
      });
    }

    if (String(password).length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters',
      });
    }

    const existingUser = await prisma.user.findUnique({
      where: { phone: normalizedPhone },
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'This mobile number is already registered',
      });
    }

    const hashedPassword = await bcrypt.hash(String(password), 12);

    const user = await prisma.user.create({
      data: {
        name: String(name).trim(),
        phone: normalizedPhone,
        password: hashedPassword,
        city: 'Jessore Sadar',
        address: String(address).trim(),
        role: 'CUSTOMER',
      },
      select: {
        id: true,
        name: true,
        phone: true,
        city: true,
        address: true,
        role: true,
        createdAt: true,
      },
    });

    const token = generateToken({
      id: user.id,
      role: user.role,
    });

    return res.status(201).json({
      success: true,
      message: 'Registration successful',
      token,
      user,
    });
  } catch (error: unknown) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2002'
    ) {
      return res.status(409).json({
        success: false,
        message: 'This mobile number is already registered',
      });
    }

    console.error('Register error:', error);

    return res.status(500).json({
      success: false,
      message: 'Registration failed',
    });
  }
};

// LOGIN
export const login = async (req: Request, res: Response) => {
  try {
    const { phone, password } = req.body;

    if (!phone || !password) {
      return res.status(400).json({
        success: false,
        message: 'Mobile number and password are required',
      });
    }

    const normalizedPhone = normalizePhone(String(phone));

    const user = await prisma.user.findUnique({
      where: { phone: normalizedPhone },
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid mobile number or password',
      });
    }

    const isPasswordValid = await bcrypt.compare(
      String(password),
      user.password
    );

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid mobile number or password',
      });
    }

    const token = generateToken({
      id: user.id,
      role: user.role,
    });

    const {
      password: _password,
      ...safeUser
    } = user;

    return res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      user: safeUser,
    });
  } catch (error: unknown) {
    console.error('Login error:', error);

    return res.status(500).json({
      success: false,
      message: 'Login failed',
    });
  }
};

// GET LOGGED-IN USER
export const getMe = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({
        success: false,
        message: 'Please login first',
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        name: true,
        phone: true,
        address: true,
        city: true,
        role: true,
        vendorStatus: true,
        createdAt: true,
      },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    return res.status(200).json({
      success: true,
      user,
    });
  } catch (error: unknown) {
    console.error('Get profile error:', error);

    return res.status(500).json({
      success: false,
      message: 'Unable to get profile',
    });
  }
};

// LOGOUT
export const logout = async (_req: Request, res: Response) => {
  return res.status(200).json({
    success: true,
    message: 'Logout successful. Please clear your saved token.',
  });
};
