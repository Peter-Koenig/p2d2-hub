import { syncKommunePolygons } from '../../utils/polygon-wfst-sync';

export async function POST({ request }) {
  try {
    const { slug } = await request.json();
    
    if (!slug) {
      return new Response(JSON.stringify({ error: 'slug parameter required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const result = await syncKommunePolygons(slug);
    
    return new Response(JSON.stringify(result), {
      status: result.success ? 200 : 500,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

