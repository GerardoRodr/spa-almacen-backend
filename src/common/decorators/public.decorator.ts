import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';
// Decorador para marcar rutas publicas que no requieren JWT
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
