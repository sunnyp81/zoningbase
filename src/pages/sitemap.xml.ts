import type { APIRoute } from 'astro';
import { getDB } from '../lib/db';

export const GET: APIRoute = async ({ locals }) => {
  const db = getDB(locals);

  const [states, counties, cities, zones] = await Promise.all([
    db.prepare('SELECT slug FROM states ORDER BY name').all<{ slug: string }>(),
    db
      .prepare(
        `SELECT s.slug AS state_slug, c.slug AS county_slug
         FROM counties c JOIN states s ON s.id = c.state_id
         ORDER BY s.name, c.name`
      )
      .all<{ state_slug: string; county_slug: string }>(),
    db
      .prepare(
        `SELECT s.slug AS state_slug, co.slug AS county_slug, ci.slug AS city_slug
         FROM cities ci
         JOIN counties co ON co.id = ci.county_id
         JOIN states s ON s.id = co.state_id
         ORDER BY s.name, co.name, ci.name`
      )
      .all<{ state_slug: string; county_slug: string; city_slug: string }>(),
    db
      .prepare(
        `SELECT s.slug AS state_slug, co.slug AS county_slug, ci.slug AS city_slug, z.zone_code_slug
         FROM zones z
         JOIN cities ci ON z.city_id = ci.id
         JOIN counties co ON ci.county_id = co.id
         JOIN states s ON co.state_id = s.id
         ORDER BY s.name, co.name, ci.name, z.zone_code`
      )
      .all<{ state_slug: string; county_slug: string; city_slug: string; zone_code_slug: string }>(),
  ]);

  const base = 'https://zoningbase.com';
  const today = new Date().toISOString().split('T')[0];

  const urls: string[] = [
    `<url><loc>${base}/</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>1.0</priority></url>`,
    `<url><loc>${base}/about/</loc><lastmod>${today}</lastmod><changefreq>monthly</changefreq><priority>0.3</priority></url>`,
    `<url><loc>${base}/privacy/</loc><lastmod>${today}</lastmod><changefreq>yearly</changefreq><priority>0.1</priority></url>`,
    `<url><loc>${base}/terms/</loc><lastmod>${today}</lastmod><changefreq>yearly</changefreq><priority>0.1</priority></url>`,
    `<url><loc>${base}/contact/</loc><lastmod>${today}</lastmod><changefreq>yearly</changefreq><priority>0.2</priority></url>`,
  ];

  for (const { slug } of states.results) {
    urls.push(
      `<url><loc>${base}/${slug}/</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>0.8</priority></url>`
    );
  }

  for (const { state_slug, county_slug } of counties.results) {
    urls.push(
      `<url><loc>${base}/${state_slug}/${county_slug}/</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>0.7</priority></url>`
    );
  }

  for (const { state_slug, county_slug, city_slug } of cities.results) {
    urls.push(
      `<url><loc>${base}/${state_slug}/${county_slug}/${city_slug}/</loc><lastmod>${today}</lastmod><changefreq>monthly</changefreq><priority>0.6</priority></url>`
    );
  }

  for (const { state_slug, county_slug, city_slug, zone_code_slug } of zones.results) {
    urls.push(
      `<url><loc>${base}/${state_slug}/${county_slug}/${city_slug}/zoning/${zone_code_slug}/</loc><lastmod>${today}</lastmod><changefreq>monthly</changefreq><priority>0.5</priority></url>`
    );
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': 'public, s-maxage=86400, max-age=3600',
    },
  });
};
