"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const prisma_1 = __importDefault(require("../prisma"));
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
router.post('/register', async (req, res) => {
    const { email, password, name, first_name, last_name } = req.body;
    if (!email || !password)
        return res.status(400).json({ error: 'Email and password required' });
    try {
        const hashed = await bcryptjs_1.default.hash(password, 10);
        const user = await prisma_1.default.user.create({ data: { email, password: hashed, name } });
        // Create corresponding profile
        const [firstName, lastName] = name ? name.split(' ') : [first_name || '', last_name || ''];
        await prisma_1.default.profile.create({
            data: {
                userId: user.id,
                first_name: firstName || 'User',
                last_name: lastName || '',
                email: user.email,
                status: 'active',
            }
        });
        res.json({ id: user.id, email: user.email, name: user.name });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password)
        return res.status(400).json({ error: 'Email and password required' });
    try {
        const user = await prisma_1.default.user.findUnique({
            where: { email },
            include: {
                roles: true,
                profile: { include: { role: true } } // Include job role
            }
        });
        if (!user || !user.password)
            return res.status(401).json({ error: 'Invalid credentials' });
        const ok = await bcryptjs_1.default.compare(password, user.password);
        if (!ok)
            return res.status(401).json({ error: 'Invalid credentials' });
        // Extract auth role names from user.roles (for access control)
        const authRoles = user.roles.map(r => r.role);
        // Extract job role info (for billing and permissions)
        const jobRole = user.profile?.role ? {
            id: user.profile.role.id,
            name: user.profile.role.name,
            billing_rate: user.profile.role.billing_rate,
            permissions: user.profile.role.permissions,
        } : null;
        const secret = process.env.JWT_SECRET || 'change-me';
        const token = jsonwebtoken_1.default.sign({
            sub: user.id,
            email: user.email,
            authRoles, // Authentication roles: super_admin, hr_manager, partner, employee
            jobRole // Job role with billing rate
        }, secret, { expiresIn: '7d' });
        res.json({
            token,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                authRoles,
                jobRole
            }
        });
    }
    catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: err.message });
    }
});
router.get('/debug-me', auth_1.authMiddleware, async (req, res) => {
    const userId = req.user?.sub;
    if (!userId)
        return res.status(401).json({ error: 'Unauthorized' });
    try {
        const user = await prisma_1.default.user.findUnique({
            where: { id: userId },
            include: {
                roles: true,
                profile: true
            }
        });
        if (!user)
            return res.status(404).json({ error: 'Not found' });
        // Return JWT token content + DB roles for debugging
        res.json({
            jwt_payload: req.user,
            database_user: {
                id: user.id,
                email: user.email,
                name: user.name,
                roles_in_db: user.roles.map(r => r.role)
            }
        });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
router.get('/me', auth_1.authMiddleware, async (req, res) => {
    const userId = req.user?.sub;
    if (!userId)
        return res.status(401).json({ error: 'Unauthorized' });
    try {
        const user = await prisma_1.default.user.findUnique({
            where: { id: userId },
            include: {
                roles: true,
                profile: true
            }
        });
        if (!user)
            return res.status(404).json({ error: 'Not found' });
        // Check if user is a partner
        let partner = null;
        if (user.profile) {
            partner = await prisma_1.default.partner.findUnique({
                where: { profile_id: user.profile.id },
                include: { company: true }
            });
        }
        const roles = user.roles.map(r => r.role);
        res.json({
            id: user.id,
            email: user.email,
            name: user.name,
            profile_id: user.profile?.id,
            roles,
            is_partner: roles.includes('partner'),
            partner: partner ? {
                id: partner.id,
                profile_id: partner.profile_id,
                company_name: partner.company?.company_name,
                group_name: partner.group_name,
                commission_rate: partner.commission_rate
            } : null
        });
    }
    catch (err) {
        console.error('Get user error:', err);
        res.status(500).json({ error: err.message });
    }
});
exports.default = router;
