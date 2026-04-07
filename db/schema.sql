-- ZoningBase D1 Schema — Phase 1
PRAGMA foreign_keys = ON;

-- States (50 + DC + territories)
CREATE TABLE IF NOT EXISTS states (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT NOT NULL UNIQUE,
  slug         TEXT NOT NULL UNIQUE,
  abbreviation TEXT NOT NULL UNIQUE
);
CREATE INDEX IF NOT EXISTS idx_states_slug ON states(slug);

-- Counties (~3,200 rows)
CREATE TABLE IF NOT EXISTS counties (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  state_id INTEGER NOT NULL REFERENCES states(id),
  name     TEXT NOT NULL,
  slug     TEXT NOT NULL,
  UNIQUE(state_id, slug)
);
CREATE INDEX IF NOT EXISTS idx_counties_state_id ON counties(state_id);

-- Cities (~30,000 rows)
CREATE TABLE IF NOT EXISTS cities (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  county_id  INTEGER NOT NULL REFERENCES counties(id),
  name       TEXT NOT NULL,
  slug       TEXT NOT NULL,
  latitude   REAL,
  longitude  REAL,
  population INTEGER,
  UNIQUE(county_id, slug)
);
CREATE INDEX IF NOT EXISTS idx_cities_county_id ON cities(county_id);

-- Zones (~200,000+ rows)
CREATE TABLE IF NOT EXISTS zones (
  id                       INTEGER PRIMARY KEY AUTOINCREMENT,
  city_id                  INTEGER NOT NULL REFERENCES cities(id),
  zone_code                TEXT NOT NULL,
  zone_code_slug           TEXT NOT NULL,
  zone_name                TEXT NOT NULL,
  description              TEXT,
  max_height_ft            REAL,
  far                      REAL,
  min_lot_size_sqft        REAL,
  max_impervious_cover_pct REAL,
  setback_front_ft         REAL,
  setback_rear_ft          REAL,
  setback_side_ft          REAL,
  parking_requirement      TEXT,
  UNIQUE(city_id, zone_code_slug)
);
CREATE INDEX IF NOT EXISTS idx_zones_city_id ON zones(city_id);

-- Permitted uses lookup table
CREATE TABLE IF NOT EXISTS permitted_uses (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  name     TEXT NOT NULL,
  category TEXT NOT NULL,
  UNIQUE(name, category)
);

-- Junction: Zone <-> Permitted Use (many-to-many)
CREATE TABLE IF NOT EXISTS zone_permitted_uses (
  zone_id          INTEGER NOT NULL REFERENCES zones(id),
  permitted_use_id INTEGER NOT NULL REFERENCES permitted_uses(id),
  PRIMARY KEY (zone_id, permitted_use_id)
);
CREATE INDEX IF NOT EXISTS idx_zpu_zone_id ON zone_permitted_uses(zone_id);
