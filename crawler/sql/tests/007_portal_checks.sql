-- Non-mutating production checks following 007.
BEGIN READ ONLY;
DO $$ DECLARE s text; r text; BEGIN
  FOREACH s IN ARRAY ARRAY['suumo','rakusumu'] LOOP
    IF NOT crawler.source_customer_eligible(s,'active','active',NULL,'sale','house') THEN RAISE EXCEPTION 'Portal eligibility failed'; END IF;
    IF crawler.source_customer_eligible(s,'active','active','unknown','sale','house')
       OR crawler.source_customer_eligible(s,'active','active',NULL,'rent','house')
       OR crawler.source_customer_eligible(s,'active','active',NULL,'sale','land') THEN RAISE EXCEPTION 'Unsafe portal eligibility'; END IF;
    FOREACH r IN ARRAY ARRAY['unknown','under_negotiation','viewings_closed','sold','withdrawn'] LOOP
      IF crawler.source_customer_eligible(s,'active',r,NULL,'sale','house') THEN RAISE EXCEPTION 'Restricted portal eligible'; END IF;
    END LOOP;
  END LOOP;
  FOREACH r IN ARRAY ARRAY['anon','authenticated','crawler_customer_reader','property_finder_web_reader'] LOOP
    IF has_schema_privilege(r,'crawler','USAGE') OR has_table_privilege(r,'crawler.properties','INSERT,UPDATE,DELETE') THEN RAISE EXCEPTION 'Private/write grant expanded'; END IF;
  END LOOP;
  IF has_column_privilege('crawler_customer_reader','crawler.properties','portal_duplicate_review_pending','SELECT') OR has_column_privilege('crawler_customer_reader','crawler.properties','source_facts','SELECT') THEN RAISE EXCEPTION 'Private review metadata grant detected'; END IF;
  IF NOT EXISTS(SELECT FROM pg_policies WHERE schemaname='crawler' AND tablename='properties' AND policyname='portal_duplicate_review_gate' AND permissive='RESTRICTIVE') THEN RAISE EXCEPTION 'Duplicate review RLS gate missing'; END IF;
  IF NOT has_table_privilege('crawler_customer_reader','property_api.customer_properties','SELECT') THEN RAISE EXCEPTION 'Reader view access missing'; END IF;
  IF EXISTS(SELECT FROM information_schema.columns WHERE table_schema='property_api' AND table_name='customer_properties' AND column_name IN ('source_facts','portal_duplicate_review_pending','source_property_id','address','id')) THEN RAISE EXCEPTION 'Private fields exposed'; END IF;
END $$;
ROLLBACK;
