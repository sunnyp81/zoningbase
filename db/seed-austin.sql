-- Seed: Austin, Texas — MF-4 zone with realistic data
-- Source: City of Austin Land Development Code, Title 25

PRAGMA foreign_keys = ON;

-- State
INSERT INTO states (name, slug, abbreviation) VALUES ('Texas', 'texas', 'TX')
  ON CONFLICT (slug) DO NOTHING;

-- County
INSERT INTO counties (state_id, name, slug)
  VALUES ((SELECT id FROM states WHERE slug = 'texas'), 'Travis County', 'travis-county')
  ON CONFLICT (state_id, slug) DO NOTHING;

-- City
INSERT INTO cities (county_id, name, slug, latitude, longitude, population)
  VALUES (
    (SELECT id FROM counties WHERE slug = 'travis-county'),
    'Austin', 'austin', 30.2672, -97.7431, 964177
  )
  ON CONFLICT (county_id, slug) DO UPDATE SET
    latitude = excluded.latitude,
    longitude = excluded.longitude,
    population = excluded.population;

-- Zone: MF-4 (Multi-Family Residence Moderate-High Density)
INSERT INTO zones (
  city_id, zone_code, zone_code_slug, zone_name, description,
  max_height_ft, far, min_lot_size_sqft, max_impervious_cover_pct,
  setback_front_ft, setback_rear_ft, setback_side_ft, parking_requirement
) VALUES (
  (SELECT id FROM cities WHERE slug = 'austin'),
  'MF-4',
  'mf-4',
  'Multi-Family Residence Moderate-High Density',
  'The MF-4 district is intended for multi-family residential use at moderate to high densities. It permits apartments, condominiums, townhouses, and group residential facilities. Development is subject to compatibility standards when adjacent to single-family zoning.',
  60,
  1.5,
  8000,
  70,
  15,
  10,
  5,
  '1 space per bedroom for units with 1-2 bedrooms; 0.75 spaces per bedroom for units with 3+ bedrooms. Bicycle parking: 1 per 2 units.'
)
ON CONFLICT (city_id, zone_code_slug) DO UPDATE SET
  zone_name = excluded.zone_name,
  description = excluded.description,
  max_height_ft = excluded.max_height_ft,
  far = excluded.far,
  min_lot_size_sqft = excluded.min_lot_size_sqft,
  max_impervious_cover_pct = excluded.max_impervious_cover_pct,
  setback_front_ft = excluded.setback_front_ft,
  setback_rear_ft = excluded.setback_rear_ft,
  setback_side_ft = excluded.setback_side_ft,
  parking_requirement = excluded.parking_requirement;

-- Additional zones for Austin to demonstrate hierarchy
INSERT INTO zones (city_id, zone_code, zone_code_slug, zone_name, description,
  max_height_ft, far, min_lot_size_sqft, max_impervious_cover_pct,
  setback_front_ft, setback_rear_ft, setback_side_ft, parking_requirement)
VALUES
  ((SELECT id FROM cities WHERE slug = 'austin'),
   'SF-3', 'sf-3', 'Single-Family Residence Standard Lot',
   'The SF-3 district is for single-family residential use on standard-sized lots. Accessory dwelling units (ADUs) are permitted subject to size and setback requirements.',
   35, 0.4, 5750, 45, 25, 10, 5,
   '2 off-street spaces per dwelling unit.')
ON CONFLICT (city_id, zone_code_slug) DO UPDATE SET zone_name = excluded.zone_name, description = excluded.description, max_height_ft = excluded.max_height_ft, far = excluded.far, min_lot_size_sqft = excluded.min_lot_size_sqft, max_impervious_cover_pct = excluded.max_impervious_cover_pct, setback_front_ft = excluded.setback_front_ft, setback_rear_ft = excluded.setback_rear_ft, setback_side_ft = excluded.setback_side_ft, parking_requirement = excluded.parking_requirement;

INSERT INTO zones (city_id, zone_code, zone_code_slug, zone_name, description,
  max_height_ft, far, min_lot_size_sqft, max_impervious_cover_pct,
  setback_front_ft, setback_rear_ft, setback_side_ft, parking_requirement)
VALUES
  ((SELECT id FROM cities WHERE slug = 'austin'),
   'CS', 'cs', 'General Commercial Services',
   'The CS district accommodates a broad range of commercial and service uses including retail, offices, restaurants, and entertainment. Drive-through facilities are conditionally permitted.',
   60, 1.0, 5750, 80, 0, 0, 0,
   '1 space per 300 sqft of gross floor area for retail; 1 per 100 sqft for restaurants.')
ON CONFLICT (city_id, zone_code_slug) DO UPDATE SET zone_name = excluded.zone_name, description = excluded.description, max_height_ft = excluded.max_height_ft, far = excluded.far, min_lot_size_sqft = excluded.min_lot_size_sqft, max_impervious_cover_pct = excluded.max_impervious_cover_pct, setback_front_ft = excluded.setback_front_ft, setback_rear_ft = excluded.setback_rear_ft, setback_side_ft = excluded.setback_side_ft, parking_requirement = excluded.parking_requirement;

-- Permitted uses
INSERT INTO permitted_uses (name, category) VALUES
  ('Apartment', 'Residential'),
  ('Condominium', 'Residential'),
  ('Townhouse', 'Residential'),
  ('Group Residential', 'Residential'),
  ('Duplex', 'Residential'),
  ('Single-Family Detached', 'Residential'),
  ('Accessory Dwelling Unit', 'Residential'),
  ('Home Occupation', 'Residential'),
  ('Community Garden', 'Civic'),
  ('Place of Worship', 'Civic'),
  ('Public Park', 'Civic'),
  ('Day Care (Commercial)', 'Civic'),
  ('Retail Sales', 'Commercial'),
  ('Restaurant (General)', 'Commercial'),
  ('Drive-Through Facility', 'Commercial'),
  ('Office (General)', 'Commercial'),
  ('Personal Services', 'Commercial'),
  ('Entertainment (Indoor)', 'Commercial'),
  ('Parking Facility (Commercial)', 'Commercial')
ON CONFLICT (name, category) DO NOTHING;

-- MF-4 permitted uses: apartments, condos, townhouses, group residential, duplexes
INSERT INTO zone_permitted_uses (zone_id, permitted_use_id)
  SELECT z.id, pu.id FROM zones z, permitted_uses pu
  WHERE z.zone_code_slug = 'mf-4' AND z.city_id = (SELECT id FROM cities WHERE slug = 'austin')
    AND pu.name IN ('Apartment', 'Condominium', 'Townhouse', 'Group Residential', 'Duplex')
  ON CONFLICT DO NOTHING;

-- SF-3 permitted uses: single-family, ADU, home occupation, community garden, place of worship
INSERT INTO zone_permitted_uses (zone_id, permitted_use_id)
  SELECT z.id, pu.id FROM zones z, permitted_uses pu
  WHERE z.zone_code_slug = 'sf-3' AND z.city_id = (SELECT id FROM cities WHERE slug = 'austin')
    AND pu.name IN ('Single-Family Detached', 'Accessory Dwelling Unit', 'Home Occupation', 'Community Garden', 'Place of Worship')
  ON CONFLICT DO NOTHING;

-- CS permitted uses: retail, restaurant, drive-through, office, personal services, entertainment, parking
INSERT INTO zone_permitted_uses (zone_id, permitted_use_id)
  SELECT z.id, pu.id FROM zones z, permitted_uses pu
  WHERE z.zone_code_slug = 'cs' AND z.city_id = (SELECT id FROM cities WHERE slug = 'austin')
    AND pu.name IN ('Retail Sales', 'Restaurant (General)', 'Drive-Through Facility', 'Office (General)', 'Personal Services', 'Entertainment (Indoor)', 'Parking Facility (Commercial)')
  ON CONFLICT DO NOTHING;
