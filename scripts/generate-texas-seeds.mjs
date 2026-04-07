#!/usr/bin/env node
/**
 * ZoningBase — Texas Zoning Data Generator
 *
 * Generates D1-compatible SQL seed files for major Texas cities.
 * Uses known zoning district data compiled from municipal codes.
 *
 * Usage: node scripts/generate-texas-seeds.mjs
 * Output: db/seed-texas.sql
 */

import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ============================================================
// TEXAS ZONING DATA — Compiled from municipal ordinances
// ============================================================

const texasData = {
  state: { name: 'Texas', abbreviation: 'TX' },
  cities: [
    // ── San Antonio (Bexar County) ──────────────────────────
    {
      name: 'San Antonio',
      county: 'Bexar County',
      population: 1451853,
      latitude: 29.4241,
      longitude: -98.4936,
      zones: [
        {
          code: 'R-4', name: 'Residential Single-Family',
          description: 'Low-density single-family residential district. Permits detached single-family dwellings, home occupations, and accessory structures.',
          max_height_ft: 35, far: 0.4, min_lot_size_sqft: 6000, max_impervious_cover_pct: 45,
          setback_front_ft: 25, setback_rear_ft: 5, setback_side_ft: 5,
          parking: '2 spaces per dwelling unit.',
          uses: [
            { name: 'Single-Family Detached', category: 'Residential' },
            { name: 'Home Occupation', category: 'Residential' },
            { name: 'Accessory Dwelling Unit', category: 'Residential' },
            { name: 'Place of Worship', category: 'Civic' },
            { name: 'Public Park', category: 'Civic' },
          ],
        },
        {
          code: 'R-6', name: 'Residential Single-Family (High Density)',
          description: 'Higher-density single-family residential district allowing smaller lots and zero-lot-line configurations.',
          max_height_ft: 35, far: 0.65, min_lot_size_sqft: 4000, max_impervious_cover_pct: 55,
          setback_front_ft: 20, setback_rear_ft: 5, setback_side_ft: 0,
          parking: '2 spaces per dwelling unit.',
          uses: [
            { name: 'Single-Family Detached', category: 'Residential' },
            { name: 'Townhouse', category: 'Residential' },
            { name: 'Home Occupation', category: 'Residential' },
            { name: 'Day Care (Home)', category: 'Civic' },
          ],
        },
        {
          code: 'MF-33', name: 'Multi-Family (33 units/acre)',
          description: 'Multi-family residential district allowing up to 33 dwelling units per acre. Permits apartments, condominiums, and assisted living facilities.',
          max_height_ft: 45, far: 1.2, min_lot_size_sqft: 10000, max_impervious_cover_pct: 70,
          setback_front_ft: 25, setback_rear_ft: 15, setback_side_ft: 10,
          parking: '1.5 spaces per 1BR unit, 2 spaces per 2BR+ unit.',
          uses: [
            { name: 'Apartment', category: 'Residential' },
            { name: 'Condominium', category: 'Residential' },
            { name: 'Townhouse', category: 'Residential' },
            { name: 'Assisted Living', category: 'Residential' },
            { name: 'Day Care (Commercial)', category: 'Civic' },
          ],
        },
        {
          code: 'C-2', name: 'Commercial',
          description: 'General commercial district for retail, service, office, and entertainment uses. Drive-through facilities permitted with conditional use.',
          max_height_ft: 45, far: 1.5, min_lot_size_sqft: 5000, max_impervious_cover_pct: 85,
          setback_front_ft: 0, setback_rear_ft: 0, setback_side_ft: 0,
          parking: '1 space per 250 sqft for retail; 1 per 200 sqft for office.',
          uses: [
            { name: 'Retail Sales', category: 'Commercial' },
            { name: 'Restaurant (General)', category: 'Commercial' },
            { name: 'Office (General)', category: 'Commercial' },
            { name: 'Personal Services', category: 'Commercial' },
            { name: 'Entertainment (Indoor)', category: 'Commercial' },
            { name: 'Drive-Through Facility', category: 'Commercial' },
            { name: 'Parking Facility (Commercial)', category: 'Commercial' },
          ],
        },
        {
          code: 'I-1', name: 'General Industrial',
          description: 'Light industrial district for manufacturing, warehousing, and distribution. Buffers required adjacent to residential districts.',
          max_height_ft: 60, far: 2.0, min_lot_size_sqft: 10000, max_impervious_cover_pct: 90,
          setback_front_ft: 25, setback_rear_ft: 10, setback_side_ft: 10,
          parking: '1 space per 500 sqft of gross floor area.',
          uses: [
            { name: 'Light Manufacturing', category: 'Industrial' },
            { name: 'Warehouse', category: 'Industrial' },
            { name: 'Distribution Center', category: 'Industrial' },
            { name: 'Office (General)', category: 'Commercial' },
            { name: 'Flex Space', category: 'Industrial' },
          ],
        },
        {
          code: 'MXD', name: 'Mixed-Use District',
          description: 'Promotes pedestrian-oriented mixed-use development combining residential, commercial, and civic uses in a single district or structure.',
          max_height_ft: 75, far: 3.0, min_lot_size_sqft: 5000, max_impervious_cover_pct: 90,
          setback_front_ft: 0, setback_rear_ft: 10, setback_side_ft: 0,
          parking: 'Residential: 1 per unit. Commercial: 1 per 350 sqft. Shared parking reductions available.',
          uses: [
            { name: 'Apartment', category: 'Residential' },
            { name: 'Retail Sales', category: 'Commercial' },
            { name: 'Restaurant (General)', category: 'Commercial' },
            { name: 'Office (General)', category: 'Commercial' },
            { name: 'Live-Work Unit', category: 'Residential' },
            { name: 'Public Park', category: 'Civic' },
          ],
        },
      ],
    },

    // ── Dallas (Dallas County) ──────────────────────────────
    {
      name: 'Dallas',
      county: 'Dallas County',
      population: 1304379,
      latitude: 32.7767,
      longitude: -96.7970,
      zones: [
        {
          code: 'R-7.5(A)', name: 'Single-Family Residential 7,500 sqft',
          description: 'Standard single-family residential district requiring a minimum 7,500 sqft lot. The most common residential zoning in Dallas.',
          max_height_ft: 30, far: 0.5, min_lot_size_sqft: 7500, max_impervious_cover_pct: 45,
          setback_front_ft: 25, setback_rear_ft: 5, setback_side_ft: 5,
          parking: '2 enclosed off-street spaces per dwelling unit.',
          uses: [
            { name: 'Single-Family Detached', category: 'Residential' },
            { name: 'Home Occupation', category: 'Residential' },
            { name: 'Accessory Dwelling Unit', category: 'Residential' },
            { name: 'Community Garden', category: 'Civic' },
          ],
        },
        {
          code: 'MF-2(A)', name: 'Multifamily Residential',
          description: 'Multi-family district allowing apartments, condominiums, and townhomes. Maximum density of approximately 36 units per acre.',
          max_height_ft: 36, far: 1.0, min_lot_size_sqft: 6000, max_impervious_cover_pct: 60,
          setback_front_ft: 15, setback_rear_ft: 15, setback_side_ft: 10,
          parking: '1 space per efficiency, 1.5 per 1BR, 2 per 2BR+.',
          uses: [
            { name: 'Apartment', category: 'Residential' },
            { name: 'Condominium', category: 'Residential' },
            { name: 'Townhouse', category: 'Residential' },
            { name: 'Group Residential', category: 'Residential' },
            { name: 'Day Care (Commercial)', category: 'Civic' },
          ],
        },
        {
          code: 'CR', name: 'Community Retail',
          description: 'Community-serving retail and service district. Intended for neighborhood commercial centers with limited hours of operation and minimal external impacts.',
          max_height_ft: 54, far: 1.0, min_lot_size_sqft: 5000, max_impervious_cover_pct: 80,
          setback_front_ft: 15, setback_rear_ft: 20, setback_side_ft: 10,
          parking: '1 space per 200 sqft GFA.',
          uses: [
            { name: 'Retail Sales', category: 'Commercial' },
            { name: 'Restaurant (General)', category: 'Commercial' },
            { name: 'Personal Services', category: 'Commercial' },
            { name: 'Office (General)', category: 'Commercial' },
            { name: 'Medical Clinic', category: 'Commercial' },
          ],
        },
        {
          code: 'MU-3', name: 'Mixed Use 3',
          description: 'High-intensity mixed-use district designed for urban centers and transit-oriented development. Permits a wide range of residential, commercial, and institutional uses.',
          max_height_ft: 240, far: 10.0, min_lot_size_sqft: 3000, max_impervious_cover_pct: 100,
          setback_front_ft: 0, setback_rear_ft: 0, setback_side_ft: 0,
          parking: 'Per use type. Reductions available in transit areas.',
          uses: [
            { name: 'Apartment', category: 'Residential' },
            { name: 'Condominium', category: 'Residential' },
            { name: 'Retail Sales', category: 'Commercial' },
            { name: 'Restaurant (General)', category: 'Commercial' },
            { name: 'Office (General)', category: 'Commercial' },
            { name: 'Hotel', category: 'Commercial' },
            { name: 'Entertainment (Indoor)', category: 'Commercial' },
            { name: 'Place of Worship', category: 'Civic' },
          ],
        },
        {
          code: 'IR', name: 'Industrial Research',
          description: 'Light industrial and research district for office parks, R&D facilities, clean manufacturing, and data centers.',
          max_height_ft: 80, far: 2.0, min_lot_size_sqft: 10000, max_impervious_cover_pct: 80,
          setback_front_ft: 30, setback_rear_ft: 20, setback_side_ft: 15,
          parking: '1 space per 400 sqft.',
          uses: [
            { name: 'Office (General)', category: 'Commercial' },
            { name: 'Light Manufacturing', category: 'Industrial' },
            { name: 'Data Center', category: 'Industrial' },
            { name: 'Warehouse', category: 'Industrial' },
            { name: 'Flex Space', category: 'Industrial' },
          ],
        },
      ],
    },

    // ── Fort Worth (Tarrant County) ─────────────────────────
    {
      name: 'Fort Worth',
      county: 'Tarrant County',
      population: 958692,
      latitude: 32.7555,
      longitude: -97.3308,
      zones: [
        {
          code: 'A-5', name: 'One-Family Residential',
          description: 'Single-family residential district with minimum 5,000 sqft lots. Standard zoning for established neighborhoods.',
          max_height_ft: 35, far: null, min_lot_size_sqft: 5000, max_impervious_cover_pct: 50,
          setback_front_ft: 20, setback_rear_ft: 5, setback_side_ft: 5,
          parking: '2 off-street spaces per dwelling unit.',
          uses: [
            { name: 'Single-Family Detached', category: 'Residential' },
            { name: 'Home Occupation', category: 'Residential' },
            { name: 'Place of Worship', category: 'Civic' },
            { name: 'Public Park', category: 'Civic' },
          ],
        },
        {
          code: 'D', name: 'Two-Family Residential',
          description: 'Duplex and two-family residential district. Permits duplexes, townhomes, and single-family dwellings.',
          max_height_ft: 35, far: null, min_lot_size_sqft: 3500, max_impervious_cover_pct: 55,
          setback_front_ft: 20, setback_rear_ft: 5, setback_side_ft: 5,
          parking: '2 spaces per dwelling unit.',
          uses: [
            { name: 'Single-Family Detached', category: 'Residential' },
            { name: 'Duplex', category: 'Residential' },
            { name: 'Townhouse', category: 'Residential' },
            { name: 'Home Occupation', category: 'Residential' },
          ],
        },
        {
          code: 'E', name: 'Multi-Family Residential',
          description: 'Multi-family district for apartments, condominiums, and multi-story residential buildings. Subject to design standards in urban villages.',
          max_height_ft: 60, far: null, min_lot_size_sqft: 3000, max_impervious_cover_pct: 65,
          setback_front_ft: 20, setback_rear_ft: 15, setback_side_ft: 10,
          parking: '1.5 spaces per 1BR, 2 per 2BR+.',
          uses: [
            { name: 'Apartment', category: 'Residential' },
            { name: 'Condominium', category: 'Residential' },
            { name: 'Townhouse', category: 'Residential' },
            { name: 'Group Residential', category: 'Residential' },
            { name: 'Assisted Living', category: 'Residential' },
          ],
        },
        {
          code: 'G', name: 'Intensive Commercial',
          description: 'General commercial district for high-intensity retail, entertainment, and service uses. No residential uses permitted.',
          max_height_ft: 120, far: null, min_lot_size_sqft: 5000, max_impervious_cover_pct: 90,
          setback_front_ft: 0, setback_rear_ft: 0, setback_side_ft: 0,
          parking: '1 space per 250 sqft for retail; 1 per 100 sqft for restaurants.',
          uses: [
            { name: 'Retail Sales', category: 'Commercial' },
            { name: 'Restaurant (General)', category: 'Commercial' },
            { name: 'Office (General)', category: 'Commercial' },
            { name: 'Entertainment (Indoor)', category: 'Commercial' },
            { name: 'Hotel', category: 'Commercial' },
            { name: 'Parking Facility (Commercial)', category: 'Commercial' },
          ],
        },
        {
          code: 'J', name: 'Light Industrial',
          description: 'Light industrial district for manufacturing, assembly, warehousing, and distribution. Outdoor storage screened from public rights-of-way.',
          max_height_ft: 60, far: null, min_lot_size_sqft: 10000, max_impervious_cover_pct: 85,
          setback_front_ft: 20, setback_rear_ft: 0, setback_side_ft: 10,
          parking: '1 space per 500 sqft.',
          uses: [
            { name: 'Light Manufacturing', category: 'Industrial' },
            { name: 'Warehouse', category: 'Industrial' },
            { name: 'Distribution Center', category: 'Industrial' },
            { name: 'Flex Space', category: 'Industrial' },
            { name: 'Office (General)', category: 'Commercial' },
          ],
        },
      ],
    },

    // ── El Paso (El Paso County) ────────────────────────────
    {
      name: 'El Paso',
      county: 'El Paso County',
      population: 681124,
      latitude: 31.7619,
      longitude: -106.4850,
      zones: [
        {
          code: 'R-3', name: 'Single-Family Residential',
          description: 'Low-density single-family district for detached homes on standard lots. ADUs permitted with SUP.',
          max_height_ft: 30, far: null, min_lot_size_sqft: 6600, max_impervious_cover_pct: 50,
          setback_front_ft: 20, setback_rear_ft: 5, setback_side_ft: 5,
          parking: '2 off-street spaces.',
          uses: [
            { name: 'Single-Family Detached', category: 'Residential' },
            { name: 'Home Occupation', category: 'Residential' },
            { name: 'Place of Worship', category: 'Civic' },
          ],
        },
        {
          code: 'R-5', name: 'Multi-Family Residential',
          description: 'Multi-family residential district permitting apartments, townhomes, and condominiums at moderate to high density.',
          max_height_ft: 45, far: null, min_lot_size_sqft: 5000, max_impervious_cover_pct: 65,
          setback_front_ft: 20, setback_rear_ft: 10, setback_side_ft: 5,
          parking: '1.5 spaces per unit.',
          uses: [
            { name: 'Apartment', category: 'Residential' },
            { name: 'Condominium', category: 'Residential' },
            { name: 'Townhouse', category: 'Residential' },
            { name: 'Duplex', category: 'Residential' },
          ],
        },
        {
          code: 'C-3', name: 'General Commercial',
          description: 'General commercial district accommodating a broad range of retail, service, office, and entertainment uses.',
          max_height_ft: 60, far: null, min_lot_size_sqft: 5000, max_impervious_cover_pct: 85,
          setback_front_ft: 0, setback_rear_ft: 0, setback_side_ft: 0,
          parking: '1 space per 250 sqft.',
          uses: [
            { name: 'Retail Sales', category: 'Commercial' },
            { name: 'Restaurant (General)', category: 'Commercial' },
            { name: 'Office (General)', category: 'Commercial' },
            { name: 'Personal Services', category: 'Commercial' },
            { name: 'Drive-Through Facility', category: 'Commercial' },
            { name: 'Entertainment (Indoor)', category: 'Commercial' },
          ],
        },
        {
          code: 'M-1', name: 'Light Manufacturing',
          description: 'Light manufacturing and industrial district for clean industry, fabrication, and warehousing.',
          max_height_ft: 50, far: null, min_lot_size_sqft: 10000, max_impervious_cover_pct: 80,
          setback_front_ft: 25, setback_rear_ft: 10, setback_side_ft: 10,
          parking: '1 space per 500 sqft.',
          uses: [
            { name: 'Light Manufacturing', category: 'Industrial' },
            { name: 'Warehouse', category: 'Industrial' },
            { name: 'Distribution Center', category: 'Industrial' },
            { name: 'Office (General)', category: 'Commercial' },
          ],
        },
      ],
    },

    // ── Arlington (Tarrant County) ──────────────────────────
    {
      name: 'Arlington',
      county: 'Tarrant County',
      population: 394266,
      latitude: 32.7357,
      longitude: -97.1081,
      zones: [
        {
          code: 'R-5', name: 'Single-Family District',
          description: 'Standard single-family residential district for detached dwellings on minimum 5,000 sqft lots.',
          max_height_ft: 35, far: null, min_lot_size_sqft: 5000, max_impervious_cover_pct: 50,
          setback_front_ft: 25, setback_rear_ft: 5, setback_side_ft: 5,
          parking: '2 spaces per dwelling unit.',
          uses: [
            { name: 'Single-Family Detached', category: 'Residential' },
            { name: 'Home Occupation', category: 'Residential' },
            { name: 'Accessory Dwelling Unit', category: 'Residential' },
          ],
        },
        {
          code: 'MF-22', name: 'Multi-Family (22 units/acre)',
          description: 'Multi-family residential district with maximum density of 22 dwelling units per acre.',
          max_height_ft: 45, far: null, min_lot_size_sqft: 8000, max_impervious_cover_pct: 65,
          setback_front_ft: 25, setback_rear_ft: 20, setback_side_ft: 15,
          parking: '1.5 spaces per 1BR, 2 per 2BR+.',
          uses: [
            { name: 'Apartment', category: 'Residential' },
            { name: 'Condominium', category: 'Residential' },
            { name: 'Townhouse', category: 'Residential' },
          ],
        },
        {
          code: 'LI', name: 'Light Industrial',
          description: 'Light industrial district for manufacturing, assembly, and distribution with limited external impacts.',
          max_height_ft: 50, far: null, min_lot_size_sqft: 10000, max_impervious_cover_pct: 80,
          setback_front_ft: 25, setback_rear_ft: 10, setback_side_ft: 10,
          parking: '1 space per 500 sqft.',
          uses: [
            { name: 'Light Manufacturing', category: 'Industrial' },
            { name: 'Warehouse', category: 'Industrial' },
            { name: 'Flex Space', category: 'Industrial' },
            { name: 'Office (General)', category: 'Commercial' },
          ],
        },
      ],
    },

    // ── Corpus Christi (Nueces County) ──────────────────────
    {
      name: 'Corpus Christi',
      county: 'Nueces County',
      population: 317863,
      latitude: 27.8006,
      longitude: -97.3964,
      zones: [
        {
          code: 'RS-6', name: 'Single-Family 6,000 sqft',
          description: 'Standard single-family residential district on 6,000 sqft minimum lots.',
          max_height_ft: 35, far: null, min_lot_size_sqft: 6000, max_impervious_cover_pct: 50,
          setback_front_ft: 25, setback_rear_ft: 5, setback_side_ft: 5,
          parking: '2 spaces per dwelling unit.',
          uses: [
            { name: 'Single-Family Detached', category: 'Residential' },
            { name: 'Home Occupation', category: 'Residential' },
            { name: 'Accessory Dwelling Unit', category: 'Residential' },
          ],
        },
        {
          code: 'RM-3', name: 'Multi-Family Medium Density',
          description: 'Multi-family district for apartments and condominiums at medium density.',
          max_height_ft: 45, far: null, min_lot_size_sqft: 6000, max_impervious_cover_pct: 60,
          setback_front_ft: 25, setback_rear_ft: 10, setback_side_ft: 10,
          parking: '1.5 spaces per unit.',
          uses: [
            { name: 'Apartment', category: 'Residential' },
            { name: 'Condominium', category: 'Residential' },
            { name: 'Townhouse', category: 'Residential' },
            { name: 'Duplex', category: 'Residential' },
          ],
        },
        {
          code: 'CG-2', name: 'General Commercial',
          description: 'General commercial district for a wide range of retail, service, and office uses.',
          max_height_ft: 60, far: null, min_lot_size_sqft: 5000, max_impervious_cover_pct: 85,
          setback_front_ft: 0, setback_rear_ft: 0, setback_side_ft: 0,
          parking: '1 space per 250 sqft.',
          uses: [
            { name: 'Retail Sales', category: 'Commercial' },
            { name: 'Restaurant (General)', category: 'Commercial' },
            { name: 'Office (General)', category: 'Commercial' },
            { name: 'Personal Services', category: 'Commercial' },
            { name: 'Hotel', category: 'Commercial' },
          ],
        },
      ],
    },

    // ── Plano (Collin County) ───────────────────────────────
    {
      name: 'Plano',
      county: 'Collin County',
      population: 285494,
      latitude: 33.0198,
      longitude: -96.6989,
      zones: [
        {
          code: 'SF-7', name: 'Single-Family 7,200 sqft',
          description: 'Single-family residential district with minimum 7,200 sqft lots. The most prevalent residential zoning in Plano.',
          max_height_ft: 35, far: 0.45, min_lot_size_sqft: 7200, max_impervious_cover_pct: 45,
          setback_front_ft: 25, setback_rear_ft: 8, setback_side_ft: 5,
          parking: '2 enclosed off-street spaces.',
          uses: [
            { name: 'Single-Family Detached', category: 'Residential' },
            { name: 'Home Occupation', category: 'Residential' },
            { name: 'Community Garden', category: 'Civic' },
          ],
        },
        {
          code: 'MF-18', name: 'Multi-Family (18 units/acre)',
          description: 'Multi-family district allowing up to 18 units per acre. Townhomes, condos, and garden apartments.',
          max_height_ft: 40, far: null, min_lot_size_sqft: 10000, max_impervious_cover_pct: 60,
          setback_front_ft: 25, setback_rear_ft: 20, setback_side_ft: 15,
          parking: '2 spaces per unit.',
          uses: [
            { name: 'Apartment', category: 'Residential' },
            { name: 'Condominium', category: 'Residential' },
            { name: 'Townhouse', category: 'Residential' },
          ],
        },
        {
          code: 'C-1', name: 'Neighborhood Commercial',
          description: 'Small-scale commercial district for neighborhood-serving retail and services.',
          max_height_ft: 35, far: 0.5, min_lot_size_sqft: 5000, max_impervious_cover_pct: 75,
          setback_front_ft: 15, setback_rear_ft: 10, setback_side_ft: 10,
          parking: '1 space per 250 sqft.',
          uses: [
            { name: 'Retail Sales', category: 'Commercial' },
            { name: 'Restaurant (General)', category: 'Commercial' },
            { name: 'Personal Services', category: 'Commercial' },
            { name: 'Office (General)', category: 'Commercial' },
            { name: 'Medical Clinic', category: 'Commercial' },
          ],
        },
      ],
    },

    // ── Lubbock (Lubbock County) ────────────────────────────
    {
      name: 'Lubbock',
      county: 'Lubbock County',
      population: 263930,
      latitude: 33.5779,
      longitude: -101.8552,
      zones: [
        {
          code: 'R-1', name: 'Single-Family Residential',
          description: 'Low-density single-family residential district. Standard suburban development pattern.',
          max_height_ft: 35, far: null, min_lot_size_sqft: 7000, max_impervious_cover_pct: 45,
          setback_front_ft: 25, setback_rear_ft: 5, setback_side_ft: 5,
          parking: '2 spaces per dwelling unit.',
          uses: [
            { name: 'Single-Family Detached', category: 'Residential' },
            { name: 'Home Occupation', category: 'Residential' },
            { name: 'Place of Worship', category: 'Civic' },
          ],
        },
        {
          code: 'R-3', name: 'Multi-Family Residential',
          description: 'Multi-family district for apartments and group housing. Common near Texas Tech University campus.',
          max_height_ft: 50, far: null, min_lot_size_sqft: 5000, max_impervious_cover_pct: 65,
          setback_front_ft: 25, setback_rear_ft: 10, setback_side_ft: 10,
          parking: '1.5 spaces per unit.',
          uses: [
            { name: 'Apartment', category: 'Residential' },
            { name: 'Condominium', category: 'Residential' },
            { name: 'Group Residential', category: 'Residential' },
            { name: 'Duplex', category: 'Residential' },
          ],
        },
        {
          code: 'C-2A', name: 'General Commercial',
          description: 'General commercial and retail district for community-scale shopping and services.',
          max_height_ft: 45, far: null, min_lot_size_sqft: 5000, max_impervious_cover_pct: 80,
          setback_front_ft: 0, setback_rear_ft: 0, setback_side_ft: 0,
          parking: '1 space per 250 sqft.',
          uses: [
            { name: 'Retail Sales', category: 'Commercial' },
            { name: 'Restaurant (General)', category: 'Commercial' },
            { name: 'Office (General)', category: 'Commercial' },
            { name: 'Drive-Through Facility', category: 'Commercial' },
            { name: 'Personal Services', category: 'Commercial' },
          ],
        },
      ],
    },

    // ── Laredo (Webb County) ────────────────────────────────
    {
      name: 'Laredo',
      county: 'Webb County',
      population: 255205,
      latitude: 27.5036,
      longitude: -99.5076,
      zones: [
        {
          code: 'R-1', name: 'Single-Family Residential',
          description: 'Single-family residential district for detached homes on standard lots.',
          max_height_ft: 35, far: null, min_lot_size_sqft: 7500, max_impervious_cover_pct: 50,
          setback_front_ft: 25, setback_rear_ft: 5, setback_side_ft: 5,
          parking: '2 spaces per dwelling unit.',
          uses: [
            { name: 'Single-Family Detached', category: 'Residential' },
            { name: 'Home Occupation', category: 'Residential' },
            { name: 'Place of Worship', category: 'Civic' },
          ],
        },
        {
          code: 'R-3', name: 'Multi-Family Residential',
          description: 'Multi-family district for apartments, condominiums, and townhomes.',
          max_height_ft: 45, far: null, min_lot_size_sqft: 5000, max_impervious_cover_pct: 60,
          setback_front_ft: 20, setback_rear_ft: 10, setback_side_ft: 5,
          parking: '1.5 spaces per unit.',
          uses: [
            { name: 'Apartment', category: 'Residential' },
            { name: 'Condominium', category: 'Residential' },
            { name: 'Townhouse', category: 'Residential' },
            { name: 'Duplex', category: 'Residential' },
          ],
        },
        {
          code: 'B-3', name: 'General Business',
          description: 'General business and commercial district for retail, office, and service uses.',
          max_height_ft: 60, far: null, min_lot_size_sqft: 5000, max_impervious_cover_pct: 85,
          setback_front_ft: 0, setback_rear_ft: 0, setback_side_ft: 0,
          parking: '1 space per 250 sqft.',
          uses: [
            { name: 'Retail Sales', category: 'Commercial' },
            { name: 'Restaurant (General)', category: 'Commercial' },
            { name: 'Office (General)', category: 'Commercial' },
            { name: 'Personal Services', category: 'Commercial' },
            { name: 'Drive-Through Facility', category: 'Commercial' },
          ],
        },
      ],
    },
  ],
};

// ============================================================
// SQL Generator
// ============================================================

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function esc(val) {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') return val.toString();
  return `'${val.replace(/'/g, "''")}'`;
}

function generateSQL(data) {
  const lines = [];
  lines.push('-- ZoningBase Texas Seed Data');
  lines.push('-- Auto-generated by scripts/generate-texas-seeds.mjs');
  lines.push(`-- Generated: ${new Date().toISOString()}`);
  lines.push('-- Cities: ' + data.cities.map(c => c.name).join(', '));
  lines.push('');
  lines.push('PRAGMA foreign_keys = ON;');
  lines.push('');

  // State
  const stateSlug = slugify(data.state.name);
  lines.push(`-- State: ${data.state.name}`);
  lines.push(`INSERT INTO states (name, slug, abbreviation) VALUES (${esc(data.state.name)}, ${esc(stateSlug)}, ${esc(data.state.abbreviation)})`);
  lines.push(`  ON CONFLICT (slug) DO NOTHING;`);
  lines.push('');

  // Collect all unique permitted uses
  const allUses = new Map();
  for (const city of data.cities) {
    for (const zone of city.zones) {
      for (const use of zone.uses) {
        const key = `${use.name}|${use.category}`;
        allUses.set(key, use);
      }
    }
  }

  // Insert all permitted uses
  lines.push('-- Permitted Uses (all unique)');
  for (const use of allUses.values()) {
    lines.push(`INSERT INTO permitted_uses (name, category) VALUES (${esc(use.name)}, ${esc(use.category)}) ON CONFLICT (name, category) DO NOTHING;`);
  }
  lines.push('');

  // Cities + zones
  for (const city of data.cities) {
    const countySlug = slugify(city.county);
    const citySlug = slugify(city.name);

    lines.push(`-- ── ${city.name} (${city.county}) ──`);
    lines.push('');

    // County
    lines.push(`INSERT INTO counties (state_id, name, slug)`);
    lines.push(`  VALUES ((SELECT id FROM states WHERE slug = ${esc(stateSlug)}), ${esc(city.county)}, ${esc(countySlug)})`);
    lines.push(`  ON CONFLICT (state_id, slug) DO NOTHING;`);
    lines.push('');

    // City
    lines.push(`INSERT INTO cities (county_id, name, slug, latitude, longitude, population)`);
    lines.push(`  VALUES (`);
    lines.push(`    (SELECT id FROM counties WHERE slug = ${esc(countySlug)} AND state_id = (SELECT id FROM states WHERE slug = ${esc(stateSlug)})),`);
    lines.push(`    ${esc(city.name)}, ${esc(citySlug)}, ${city.latitude}, ${city.longitude}, ${city.population}`);
    lines.push(`  )`);
    lines.push(`  ON CONFLICT (county_id, slug) DO UPDATE SET latitude = excluded.latitude, longitude = excluded.longitude, population = excluded.population;`);
    lines.push('');

    // Zones
    for (const zone of city.zones) {
      const zoneSlug = slugify(zone.code);
      lines.push(`INSERT INTO zones (city_id, zone_code, zone_code_slug, zone_name, description, max_height_ft, far, min_lot_size_sqft, max_impervious_cover_pct, setback_front_ft, setback_rear_ft, setback_side_ft, parking_requirement)`);
      lines.push(`  VALUES (`);
      lines.push(`    (SELECT id FROM cities WHERE slug = ${esc(citySlug)} AND county_id = (SELECT id FROM counties WHERE slug = ${esc(countySlug)} AND state_id = (SELECT id FROM states WHERE slug = ${esc(stateSlug)}))),`);
      lines.push(`    ${esc(zone.code)}, ${esc(zoneSlug)}, ${esc(zone.name)}, ${esc(zone.description)},`);
      lines.push(`    ${esc(zone.max_height_ft)}, ${esc(zone.far)}, ${esc(zone.min_lot_size_sqft)}, ${esc(zone.max_impervious_cover_pct)},`);
      lines.push(`    ${esc(zone.setback_front_ft)}, ${esc(zone.setback_rear_ft)}, ${esc(zone.setback_side_ft)}, ${esc(zone.parking)}`);
      lines.push(`  )`);
      lines.push(`  ON CONFLICT (city_id, zone_code_slug) DO UPDATE SET zone_name = excluded.zone_name, description = excluded.description, max_height_ft = excluded.max_height_ft, far = excluded.far, min_lot_size_sqft = excluded.min_lot_size_sqft, max_impervious_cover_pct = excluded.max_impervious_cover_pct, setback_front_ft = excluded.setback_front_ft, setback_rear_ft = excluded.setback_rear_ft, setback_side_ft = excluded.setback_side_ft, parking_requirement = excluded.parking_requirement;`);
      lines.push('');

      // Link permitted uses
      const useNames = zone.uses.map(u => esc(u.name)).join(', ');
      lines.push(`INSERT INTO zone_permitted_uses (zone_id, permitted_use_id)`);
      lines.push(`  SELECT z.id, pu.id FROM zones z, permitted_uses pu`);
      lines.push(`  WHERE z.zone_code_slug = ${esc(zoneSlug)} AND z.city_id = (SELECT id FROM cities WHERE slug = ${esc(citySlug)})`);
      lines.push(`    AND pu.name IN (${useNames})`);
      lines.push(`  ON CONFLICT DO NOTHING;`);
      lines.push('');
    }
  }

  return lines.join('\n');
}

// ============================================================
// Run
// ============================================================

const sql = generateSQL(texasData);
const outputPath = join(__dirname, '..', 'db', 'seed-texas.sql');
writeFileSync(outputPath, sql, 'utf-8');

// Stats
const totalZones = texasData.cities.reduce((sum, c) => sum + c.zones.length, 0);
const totalUses = new Set();
texasData.cities.forEach(c => c.zones.forEach(z => z.uses.forEach(u => totalUses.add(`${u.name}|${u.category}`))));

console.log(`Generated: ${outputPath}`);
console.log(`Cities: ${texasData.cities.length}`);
console.log(`Zones: ${totalZones}`);
console.log(`Unique permitted uses: ${totalUses.size}`);
console.log(`Counties: ${new Set(texasData.cities.map(c => c.county)).size}`);
