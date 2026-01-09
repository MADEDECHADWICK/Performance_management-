import { Router } from 'express';
import prisma from '../prisma';

const router = Router();

// GET /clients - List all clients
router.get('/', async (req, res) => {
  try {
    const clients = await prisma.$queryRaw<any>`
      SELECT id, client_name, "createdAt"
      FROM clients
      ORDER BY client_name
    `;
    res.json(clients);
  } catch (error: any) {
    console.error('Error fetching clients:', error);
    res.status(500).json({ error: 'Failed to fetch clients' });
  }
});

// GET /clients/:id - Get client by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const clients = await prisma.$queryRaw<any>`
      SELECT id, client_name, "createdAt"
      FROM clients
      WHERE id = ${id}
    `;
    
    if (clients.length === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }
    
    res.json(clients[0]);
  } catch (error: any) {
    console.error('Error fetching client:', error);
    res.status(500).json({ error: 'Failed to fetch client' });
  }
});

export default router;
