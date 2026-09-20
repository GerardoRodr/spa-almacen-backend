import { createParamDecorator, ExecutionContext } from '@nestjs/common';

// Decorador para extraer el usuario autenticado desde el objeto request
export const CurrentUser = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;
    return data && user ? user[data] : user;
  },
);
