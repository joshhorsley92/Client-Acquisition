import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// Mirrors the Dashboard's middleware: cryptographically verifies the JWT
// on every protected route, enforces an absolute 14-day session lifetime,
// and redirects unauth'd users to /login (preserving where they were going).

const MAX_SESSION_HOURS = 14 * 24;

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request: { headers: request.headers } });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // getUser() (vs getSession()) cryptographically verifies the JWT server-side.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Force re-auth past the absolute lifetime.
  if (user?.last_sign_in_at) {
    const signInTime = new Date(user.last_sign_in_at).getTime();
    const hoursElapsed = (Date.now() - signInTime) / (1000 * 60 * 60);
    if (hoursElapsed > MAX_SESSION_HOURS) {
      await supabase.auth.signOut();
      const redirectUrl = new URL('/login', request.url);
      redirectUrl.searchParams.set('expired', '1');
      return NextResponse.redirect(redirectUrl);
    }
  }

  const pathname = request.nextUrl.pathname;
  const isAuthPath = pathname.startsWith('/login');
  const isApiAuth = pathname.startsWith('/api/auth/');
  const isPublic = isAuthPath || isApiAuth;

  if (!isPublic && !user) {
    const redirectUrl = new URL('/login', request.url);
    redirectUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(redirectUrl);
  }

  if (isAuthPath && user) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
