"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = __importDefault(require("../prisma"));
const router = (0, express_1.Router)();
// GET /clients - List all clients
router.get('/', async (req, res) => {
    try {
        const clients = await prisma_1.default.$queryRaw `
      SELECT id, client_name, "createdAt"
      FROM clients
      ORDER BY client_name
    `;
        res.json(clients);
    }
    catch (error) {
        console.error('Error fetching clients:', error);
        res.status(500).json({ error: 'Failed to fetch clients' });
    }
});
// GET /clients/:id - Get client by ID
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const clients = await prisma_1.default.$queryRaw `
      SELECT id, client_name, "createdAt"
      FROM clients
      WHERE id = ${id}
    `;
        if (clients.length === 0) {
            return res.status(404).json({ error: 'Client not found' });
        }
        res.json(clients[0]);
    }
    catch (error) {
        console.error('Error fetching client:', error);
        res.status(500).json({ error: 'Failed to fetch client' });
    }
});
exports.default = router;
