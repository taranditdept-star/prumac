-- 0071 — record a driver's national ID.
--
-- The office captures it when a driver joins (it is on the licence application,
-- and insurers ask for it after an accident), but there was nowhere to put it,
-- so it was being kept on paper. Nullable: most existing drivers were imported
-- from the register, which did not carry ID numbers.
alter table app.drivers add column if not exists national_id text;

-- Two drivers cannot share an ID, but plenty of rows legitimately have none.
create unique index if not exists drivers_national_id_key
  on app.drivers (national_id) where national_id is not null;

comment on column app.drivers.national_id is
  'National identity number, e.g. 28-102281-G-21 (ZW) or 8001015009087 (ZA).';
