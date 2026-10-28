-- POST-APPROVAL verification, after migration 003. Read-only; no test listings.
BEGIN READ ONLY;
DO $$
DECLARE s text; k text;
BEGIN
    IF NOT crawler.source_customer_eligible('myoko_akiya_bank','active','active',NULL,NULL,'unknown') THEN
        RAISE EXCEPTION 'Legacy Myoko eligibility changed';
    END IF;
    IF NOT crawler.source_customer_eligible('shinano_akiya_bank','active','active',NULL,'sale','lodge') THEN
        RAISE EXCEPTION 'Unrestricted sale pension must be eligible';
    END IF;
    FOREACH s IN ARRAY ARRAY['under_negotiation','viewings_closed','sold','withdrawn','unknown'] LOOP
        IF crawler.source_customer_eligible('shinano_akiya_bank','active',s,NULL,'sale','house') THEN
            RAISE EXCEPTION 'Restricted availability exposed';
        END IF;
    END LOOP;
    FOREACH s IN ARRAY ARRAY['sold','withdrawn','not_found'] LOOP
        IF crawler.source_customer_eligible('shinano_akiya_bank',s,'active',NULL,'sale','house') THEN
            RAISE EXCEPTION 'Unpublished listing exposed';
        END IF;
    END LOOP;
    FOREACH k IN ARRAY ARRAY['land','unknown','other'] LOOP
        IF crawler.source_customer_eligible('shinano_akiya_bank','active','active',NULL,'sale',k) THEN
            RAISE EXCEPTION 'Unverified building classification exposed';
        END IF;
    END LOOP;
    IF crawler.source_customer_eligible('shinano_akiya_bank','active','active',NULL,'rent','house')
        OR crawler.source_customer_eligible('shinano_akiya_bank','active','active',NULL,NULL,'house')
        OR crawler.source_customer_eligible('shinano_akiya_bank','active','active','交渉中','sale','house')
        OR crawler.source_customer_eligible('shinano_akiya_bank','active','active','unknown badge','sale','house') THEN
        RAISE EXCEPTION 'Rental/unknown/restricted listing exposed';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='property_api'
        AND table_name='customer_properties' AND column_name IN
        ('id','source_property_id','identity_token','source_status_ja','source_facts','address')) THEN
        RAISE EXCEPTION 'Internal fields exposed';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='property_api' AND c.relname='customer_properties'
        AND c.reloptions @> ARRAY['security_invoker=true','security_barrier=true']) THEN
        RAISE EXCEPTION 'View security options changed';
    END IF;
    FOREACH s IN ARRAY ARRAY['anon','authenticated','crawler_customer_reader'] LOOP
        IF has_schema_privilege(s,'crawler','USAGE') THEN
            RAISE EXCEPTION 'Private schema usage granted';
        END IF;
        IF has_table_privilege(s,'crawler.properties','INSERT,UPDATE,DELETE,TRUNCATE') THEN
            RAISE EXCEPTION 'Customer role obtained write privileges';
        END IF;
    END LOOP;
END $$;
ROLLBACK;
