-- 010_ph_boards.sql
-- Seeds ats_companies so the daily digest has enough jobs to fill (SPEC
-- "Build order", phase 3 gate: wake up to ten jobs you had not seen).
--
-- Every token was checked against the live public API on 2026-11-08, and
-- each board had postings that pass isRelevantLocation (lib/ats.ts): located
-- in the Philippines, or open remote. The counts in the comments are from
-- that check and will drift. Big local employers (Globe, Smart, GCash,
-- Kalibrr) are not here: they do not use Greenhouse or Lever.
--
-- Data only, no schema change. "on conflict do nothing" keeps boards that
-- were already added by hand, including their active flag.

insert into public.ats_companies (platform, board_token)
values
  -- Hiring in the Philippines (PH-located postings at check time)
  ('lever',      'coins'),        -- Coins.ph, ~50
  ('greenhouse', 'coinbase'),     -- Coinbase (Manila hub), ~40
  ('lever',      'ninjavan'),     -- Ninja Van, ~13
  ('lever',      'lalamove'),     -- Lalamove, ~13
  ('greenhouse', 'binance'),      -- Binance, ~6
  ('greenhouse', 'xendit'),       -- Xendit, ~4
  ('greenhouse', 'thunes'),       -- Thunes, ~4
  ('greenhouse', 'agoda'),        -- Agoda, ~3
  ('greenhouse', 'okta'),         -- Okta, ~3
  ('greenhouse', 'okx'),          -- OKX, ~1 PH plus open remote
  ('lever',      'tala'),         -- Tala, ~2
  ('lever',      'kinsta'),       -- Kinsta, ~1
  ('greenhouse', 'payoneer'),     -- Payoneer, ~1

  -- Open remote (postings anyone in PH can apply to)
  ('greenhouse', 'canonical'),    -- Canonical, ~97
  ('greenhouse', 'wikimedia'),    -- Wikimedia Foundation, ~15
  ('greenhouse', 'mozilla'),      -- Mozilla, ~15
  ('greenhouse', 'stripe'),       -- Stripe, ~9
  ('greenhouse', 'bybit'),        -- Bybit, ~8
  ('greenhouse', 'gitlab'),       -- GitLab, ~6
  ('lever',      'xsolla'),       -- Xsolla, ~6
  ('greenhouse', 'netlify'),      -- Netlify, ~5
  ('greenhouse', 'invisible'),    -- Invisible Technologies, ~4
  ('greenhouse', 'fivetran'),     -- Fivetran, ~4
  ('greenhouse', 'toast'),        -- Toast, ~4
  ('greenhouse', 'bitgo'),        -- BitGo, ~3
  ('greenhouse', 'planetscale'),  -- PlanetScale, ~2
  ('greenhouse', 'turing'),       -- Turing, ~2
  ('lever',      'toptal'),       -- Toptal, ~2
  ('greenhouse', 'aptoslabs'),    -- Aptos Labs, ~2
  ('greenhouse', 'bitwarden')     -- Bitwarden, ~2
on conflict (platform, board_token) do nothing;
