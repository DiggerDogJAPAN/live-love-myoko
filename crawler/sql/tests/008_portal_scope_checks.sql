BEGIN READ ONLY;
DO $$ DECLARE definition text; BEGIN
  SELECT qual INTO definition FROM pg_policies WHERE schemaname='crawler' AND tablename='properties' AND policyname='portal_duplicate_review_gate' AND permissive='RESTRICTIVE';
  IF definition IS NULL OR position('Shinano Town' in definition)=0 OR position('Myoko' in definition)=0 OR position('address' in definition)=0 THEN RAISE EXCEPTION 'Geographic RLS gate missing'; END IF;
  IF has_column_privilege('crawler_customer_reader','crawler.properties','portal_duplicate_review_pending','SELECT') OR has_column_privilege('crawler_customer_reader','crawler.properties','source_facts','SELECT') THEN RAISE EXCEPTION 'Private metadata exposed'; END IF;
  IF has_schema_privilege('crawler_customer_reader','crawler','USAGE') THEN RAISE EXCEPTION 'Private schema access expanded'; END IF;
END $$;
ROLLBACK;
