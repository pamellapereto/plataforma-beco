ALTER TABLE public.fair_spaces
  ADD COLUMN latitude numeric(9,6),
  ADD COLUMN longitude numeric(9,6),
  ADD CONSTRAINT fair_spaces_geographic_coordinates CHECK (
    (latitude IS NULL AND longitude IS NULL) OR
    (latitude IS NOT NULL AND longitude IS NOT NULL AND latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180)
  );
COMMENT ON COLUMN public.fair_spaces.latitude IS 'Private geographic stand position; distinct from legacy schematic x/y coordinates.';
COMMENT ON COLUMN public.fair_spaces.longitude IS 'Private geographic stand position. Expose only to organization admins and the assigned exhibitor.';
