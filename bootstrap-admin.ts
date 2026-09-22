import { createUser } from './src/lib/auth';
import { ensureAppSchema } from './src/lib/schema';

async function bootstrap() {
  await ensureAppSchema();
  
  try {
    const user = await createUser(
      'admin',
      'admin@tren.gov.tr',
      'admin123',
      'Sistem Yöneticisi',
      'admin',
      'Yönetim',
      'Merkez',
      'Sistem Yöneticisi',
      '+90 555 000 00 00'
    );
    console.log('Admin user created:', user);
  } catch (error) {
    console.error('Error creating admin:', error);
  }
}

bootstrap();
