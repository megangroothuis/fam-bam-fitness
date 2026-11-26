-- =====================================================================
--  Fam Bam roster — who can log in.
--  1. Replace each 555 number with that person's real cell number
--     (any format works: (612) 555-0101, 612-555-0101, +1 612 555 0101).
--  2. Delete anyone who isn't playing, or copy a line to add someone.
--     sprite must be one of:
--       mark, jaimi, megan, nate, matthew, riley, julia, staci, carol
--  3. Run it in Supabase → SQL Editor. Re-running updates names/sprites.
-- =====================================================================

insert into members (name, phone, sprite) values
  ('Mark',    '555-555-0101', 'mark'),
  ('Jaimi',   '555-555-0102', 'jaimi'),
  ('Megan',   '555-555-0103', 'megan'),
  ('Nate',    '555-555-0104', 'nate'),
  ('Matthew', '555-555-0105', 'matthew'),
  ('Riley',   '555-555-0106', 'riley'),
  ('Julia',   '555-555-0107', 'julia'),
  ('Staci',   '555-555-0108', 'staci'),
  ('Carol',   '555-555-0109', 'carol')
on conflict (phone) do update set name = excluded.name, sprite = excluded.sprite;
