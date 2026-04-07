import type { APIRoute } from 'astro';
import { getDB } from '../../lib/db';

interface ZonePayload {
  zone_code: string;
  zone_name: string;
  description?: string;
  max_height_ft?: number;
  far?: number;
  min_lot_size_sqft?: number;
  max_impervious_cover_pct?: number;
  setback_front_ft?: number;
  setback_rear_ft?: number;
  setback_side_ft?: number;
  parking_requirement?: string;
  permitted_uses?: { name: string; category: string }[];
}

interface IngestPayload {
  state: { name: string; abbreviation: string };
  county: string;
  city: { name: string; latitude?: number; longitude?: number; population?: number };
  zones: ZonePayload[];
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export const POST: APIRoute = async ({ request, locals }) => {
  // Simple bearer token auth — set INGEST_KEY in wrangler.toml secrets
  const authHeader = request.headers.get('Authorization');
  const expectedKey = (locals.runtime.env as Record<string, string>).INGEST_KEY;

  if (expectedKey && authHeader !== `Bearer ${expectedKey}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let payload: IngestPayload;
  try {
    payload = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!payload.state?.name || !payload.county || !payload.city?.name || !payload.zones?.length) {
    return new Response(
      JSON.stringify({ error: 'Missing required fields: state, county, city, zones' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const db = getDB(locals);

  try {
    // 1. Upsert state
    await db
      .prepare(
        `INSERT INTO states (name, slug, abbreviation)
         VALUES (?, ?, ?)
         ON CONFLICT (slug) DO UPDATE SET name = excluded.name, abbreviation = excluded.abbreviation`,
      )
      .bind(payload.state.name, slugify(payload.state.name), payload.state.abbreviation)
      .run();

    const stateRow = await db
      .prepare('SELECT id FROM states WHERE slug = ?')
      .bind(slugify(payload.state.name))
      .first<{ id: number }>();

    // 2. Upsert county
    const countySlug = slugify(payload.county);
    await db
      .prepare(
        `INSERT INTO counties (state_id, name, slug)
         VALUES (?, ?, ?)
         ON CONFLICT (state_id, slug) DO UPDATE SET name = excluded.name`,
      )
      .bind(stateRow!.id, payload.county, countySlug)
      .run();

    const countyRow = await db
      .prepare('SELECT id FROM counties WHERE state_id = ? AND slug = ?')
      .bind(stateRow!.id, countySlug)
      .first<{ id: number }>();

    // 3. Upsert city
    const citySlug = slugify(payload.city.name);
    await db
      .prepare(
        `INSERT INTO cities (county_id, name, slug, latitude, longitude, population)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (county_id, slug) DO UPDATE SET
           latitude = excluded.latitude,
           longitude = excluded.longitude,
           population = excluded.population`,
      )
      .bind(
        countyRow!.id,
        payload.city.name,
        citySlug,
        payload.city.latitude ?? null,
        payload.city.longitude ?? null,
        payload.city.population ?? null,
      )
      .run();

    const cityRow = await db
      .prepare('SELECT id FROM cities WHERE county_id = ? AND slug = ?')
      .bind(countyRow!.id, citySlug)
      .first<{ id: number }>();

    // 4. Upsert zones + permitted uses
    let zonesInserted = 0;
    let usesLinked = 0;

    for (const zone of payload.zones) {
      const zoneSlug = slugify(zone.zone_code);

      await db
        .prepare(
          `INSERT INTO zones (city_id, zone_code, zone_code_slug, zone_name, description,
             max_height_ft, far, min_lot_size_sqft, max_impervious_cover_pct,
             setback_front_ft, setback_rear_ft, setback_side_ft, parking_requirement)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (city_id, zone_code_slug) DO UPDATE SET
             zone_code = excluded.zone_code,
             zone_name = excluded.zone_name,
             description = excluded.description,
             max_height_ft = excluded.max_height_ft,
             far = excluded.far,
             min_lot_size_sqft = excluded.min_lot_size_sqft,
             max_impervious_cover_pct = excluded.max_impervious_cover_pct,
             setback_front_ft = excluded.setback_front_ft,
             setback_rear_ft = excluded.setback_rear_ft,
             setback_side_ft = excluded.setback_side_ft,
             parking_requirement = excluded.parking_requirement`,
        )
        .bind(
          cityRow!.id,
          zone.zone_code,
          zoneSlug,
          zone.zone_name,
          zone.description ?? null,
          zone.max_height_ft ?? null,
          zone.far ?? null,
          zone.min_lot_size_sqft ?? null,
          zone.max_impervious_cover_pct ?? null,
          zone.setback_front_ft ?? null,
          zone.setback_rear_ft ?? null,
          zone.setback_side_ft ?? null,
          zone.parking_requirement ?? null,
        )
        .run();

      zonesInserted++;

      const zoneRow = await db
        .prepare('SELECT id FROM zones WHERE city_id = ? AND zone_code_slug = ?')
        .bind(cityRow!.id, zoneSlug)
        .first<{ id: number }>();

      // Link permitted uses
      if (zone.permitted_uses?.length) {
        // Clear existing links for this zone (full replace on upsert)
        await db
          .prepare('DELETE FROM zone_permitted_uses WHERE zone_id = ?')
          .bind(zoneRow!.id)
          .run();

        for (const use of zone.permitted_uses) {
          // Upsert the permitted use
          await db
            .prepare(
              `INSERT INTO permitted_uses (name, category)
               VALUES (?, ?)
               ON CONFLICT DO NOTHING`,
            )
            .bind(use.name, use.category)
            .run();

          // We need to find it — permitted_uses doesn't have a unique constraint on (name, category)
          // so let's query by both
          const useRow = await db
            .prepare('SELECT id FROM permitted_uses WHERE name = ? AND category = ?')
            .bind(use.name, use.category)
            .first<{ id: number }>();

          if (useRow) {
            await db
              .prepare(
                `INSERT INTO zone_permitted_uses (zone_id, permitted_use_id)
                 VALUES (?, ?)
                 ON CONFLICT DO NOTHING`,
              )
              .bind(zoneRow!.id, useRow.id)
              .run();
            usesLinked++;
          }
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        state: payload.state.name,
        county: payload.county,
        city: payload.city.name,
        zones_upserted: zonesInserted,
        uses_linked: usesLinked,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
