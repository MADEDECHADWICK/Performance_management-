import app from './app';
import dotenv from 'dotenv';

dotenv.config();

const PORT = Number(process.env.PORT || 4000);

const server = app.listen(PORT, '0.0.0.0', () => {
  // eslint-disable-next-line no-console
  console.log(`Server running on http://localhost:${PORT}`);
});

server.on('error', (err: any) => {
  // eslint-disable-next-line no-console
  console.error('Server error:', err);
});
