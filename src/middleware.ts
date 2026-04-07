import { defineMiddleware } from 'astro:middleware';

export const onRequest = defineMiddleware(async (context, next) => {
  const response = await next();

  if (context.request.method === 'GET' && !context.url.pathname.startsWith('/api/')) {
    response.headers.set('Cache-Control', 'public, s-maxage=86400, max-age=3600');
  }

  return response;
});
