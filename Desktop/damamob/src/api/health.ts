// Health check endpoint for Cloud Run
// Endpoint: GET /api/health

export async function GET(request: Request) {
  const startTime = Date.now();
  
  const checks = {
    supabase: false,
    gcsJson: false,
    database: false
  };
  
  try {
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const response = await fetch(`${supabaseUrl}/rest/v1/`, {
      headers: { 'apikey': process.env.VITE_SUPABASE_ANON_KEY || '' },
      signal: AbortSignal.timeout(5000)
    });
    checks.supabase = response.ok;
  } catch (e) {
    console.error('Supabase health check failed:', e);
  }
  
  try {
    const response = await fetch('https://storage.googleapis.com/damalight-dama-json/nikaya/index.json', {
      signal: AbortSignal.timeout(5000)
    });
    checks.gcsJson = response.ok;
  } catch (e) {
    console.error('GCS JSON health check failed:', e);
  }
  
  try {
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const response = await fetch(`${supabaseUrl}/rest/v1/profiles?limit=1`, {
      headers: { 'apikey': process.env.VITE_SUPABASE_ANON_KEY || '' },
      signal: AbortSignal.timeout(5000)
    });
    checks.database = response.ok;
  } catch (e) {
    console.error('Database health check failed:', e);
  }
  
  const allHealthy = Object.values(checks).every(v => v === true);
  const status = allHealthy ? 'healthy' : (checks.supabase ? 'degraded' : 'unhealthy');
  const httpStatus = status === 'healthy' ? 200 : (status === 'degraded' ? 503 : 500);
  
  return new Response(JSON.stringify({
    status,
    timestamp: new Date().toISOString(),
    uptime: (Date.now() - startTime) / 1000,
    checks,
    version: process.env.npm_package_version || '1.0.0'
  }), {
    status: httpStatus,
    headers: { 'Content-Type': 'application/json' }
  });
}

export async function HEAD() {
  return new Response(null, { status: 200 });
}
