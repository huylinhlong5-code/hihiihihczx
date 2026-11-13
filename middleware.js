export default function middleware(request) {
  const country = request.headers.get('x-vercel-ip-country') || '';
  if (country === 'VN') {
    return new Response(null, {
      status: 302,
      headers: { Location: 'https://www.facebook.com' }
    });
  }
}

export const config = {
  matcher: '/appeal/:path*'
};
