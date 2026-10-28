-- Read-only post-approval checks, after migration 006. Not executed by Python.
BEGIN READ ONLY;
DO $$ DECLARE s text; BEGIN
    IF NOT crawler.source_customer_eligible('iizuna_akiya_bank','active','active',NULL,'sale','house') THEN
        RAISE EXCEPTION 'Iizuna sale house eligibility failed';
    END IF;
    IF crawler.source_customer_eligible('iizuna_akiya_bank','active','active',NULL,'rent','house')
        OR crawler.source_customer_eligible('iizuna_akiya_bank','active','active',NULL,'sale','land')
        OR crawler.source_customer_eligible('iizuna_akiya_bank','active','active','unknown','sale','house') THEN
        RAISE EXCEPTION 'Iizuna unsafe classification exposed';
    END IF;
    FOREACH s IN ARRAY ARRAY['under_negotiation','sold','viewings_closed','withdrawn','unknown'] LOOP
        IF crawler.source_customer_eligible('iizuna_akiya_bank','active',s,NULL,'sale','house') THEN
            RAISE EXCEPTION 'Restricted Iizuna property exposed';
        END IF;
    END LOOP;
    FOREACH s IN ARRAY ARRAY['anon','authenticated','crawler_customer_reader'] LOOP
        IF has_schema_privilege(s,'crawler','USAGE') OR has_table_privilege(s,'crawler.properties','INSERT,UPDATE,DELETE,TRUNCATE') THEN
            RAISE EXCEPTION 'Customer private/write access expanded';
        END IF;
    END LOOP;
    IF EXISTS(SELECT 1 FROM property_api.customer_properties WHERE municipality='Iizuna Town' AND thumbnail_url IS NOT NULL AND (original_pdf_url NOT LIKE 'https://www.town.iizuna.nagano.jp/ijuportal/live/sale/%' OR thumbnail_url NOT LIKE 'https://www.town.iizuna.nagano.jp/fs/%')) THEN
        RAISE EXCEPTION 'Unapproved Iizuna photograph exposed';
    END IF;
    IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='property_api' AND table_name='customer_properties'
        AND column_name IN ('id','source_facts','source_property_id','identity_token','address')) THEN
        RAISE EXCEPTION 'Private fields exposed';
    END IF;
END $$;
ROLLBACK;
